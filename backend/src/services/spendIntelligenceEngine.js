const { withExecutor } = require('../config/dbEngine');

// timeframe is always one of the fixed string literals '30' | '90' | '365' |
// '1year' below, never user-composed SQL, so building the date-filter
// fragment per engine here (rather than a parameterized value) is safe.
function daysAgoExpr(x, days) {
  return x.engine === 'postgres'
    ? `AND created_at >= (now() - interval '${days} days')`
    : `AND created_at >= date('now', '-${days} days')`;
}

async function calculateStoreHealthScore(companyId) {
  return withExecutor(async (x) => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Calculate Spend Efficiency (Normalized ROI)
    const { getCampaignPerformance } = require('./marketingMetricsService');
    const campaigns = await getCampaignPerformance(x, companyId);

    let spendEfficiencyScore = 50; // default average
    let avgRoi = 0;
    if (campaigns.length > 0) {
      const totalRev = campaigns.reduce((s, c) => s + c.revenue, 0);
      const totalCost = campaigns.reduce((s, c) => s + c.totalCost, 0);

      avgRoi = totalCost > 0 ? ((totalRev - totalCost) / totalCost) : (totalRev > 0 ? 1 : 0);

      // Normalize: let's say an ROI of 0.5 (50%) is baseline (50 points). ROI > 2.0 (200%) caps at 100.
      spendEfficiencyScore = Math.max(0, Math.min(100, Math.round(50 + (avgRoi * 25))));
    }

    // 2. Retention Trend
    const edges = await x.all(`
      SELECT relationship_type, count(*) as cnt
      FROM knowledge_graph_edges
      WHERE company_id = ? AND node_a_type = 'customer'
      GROUP BY relationship_type
    `, [companyId]);

    let retentionScore = 60; // baseline
    const atRiskCount = edges.find(e => e.relationship_type === 'is_at_risk')?.cnt || 0;
    const totalCustomers = (await x.get(`SELECT count(*) as cnt FROM customers WHERE company_id = ?`, [companyId])).cnt;
    if (totalCustomers > 0) {
      const atRiskPercent = atRiskCount / totalCustomers;
      retentionScore = Math.max(0, Math.min(100, Math.round(100 - (atRiskPercent * 200)))); // 50% at risk = 0 score. 0% at risk = 100
    }

    // 3. Engagement
    // Using coupon redemptions as a proxy for engagement
    const coupons = await x.get(`SELECT SUM(times_used) as total_used, count(*) as count FROM coupons WHERE company_id = ?`, [companyId]);
    let engagementScore = 50;
    if (coupons.count > 0) {
      const avgRedemptions = (coupons.total_used || 0) / coupons.count;
      engagementScore = Math.max(0, Math.min(100, Math.round(30 + (avgRedemptions * 5)))); // Cap at 100 if > 14 avg redemptions
    }

    // 4. Review Sentiment
    const surveys = await x.get(`SELECT AVG(rating) as avg_rating, count(*) as count FROM survey_responses WHERE company_id = ?`, [companyId]);
    let sentimentScore = 70; // optimistic default
    if (surveys.count > 0 && surveys.avg_rating) {
      sentimentScore = Math.round((surveys.avg_rating / 5) * 100);
    }

    // Overall Score (Weighted)
    // 40% Efficiency, 30% Retention, 15% Engagement, 15% Sentiment
    const overallScore = Math.round(
      (spendEfficiencyScore * 0.40) +
      (retentionScore * 0.30) +
      (engagementScore * 0.15) +
      (sentimentScore * 0.15)
    );

    let grade = 'C';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 80) grade = 'B';
    else if (overallScore >= 70) grade = 'C';
    else if (overallScore >= 60) grade = 'D';
    else grade = 'F';

    // Calculate strengths/weaknesses
    const scores = {
      'Spend Efficiency': spendEfficiencyScore,
      'Retention Trend': retentionScore,
      'Engagement': engagementScore,
      'Review Sentiment': sentimentScore
    };
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topStrength = sorted[0][0];
    const biggestWeakness = sorted[3][0];

    // Fetch previous score for trend
    const lastSnapshot = await x.get(`
      SELECT overall_score
      FROM store_health_history
      WHERE company_id = ? AND score_date < ?
      ORDER BY score_date DESC LIMIT 1
    `, [companyId, today]);
    const scoreChange = lastSnapshot ? (overallScore - lastSnapshot.overall_score) : 0;

    // Fetch top 3 recommended actions from marketing_signals
    const signals = await x.all(`
      SELECT signal_name, confidence_score, urgency_score, metadata
      FROM marketing_signals
      WHERE company_id = ?
      ORDER BY urgency_score DESC, confidence_score DESC
      LIMIT 3
    `, [companyId]);

    // Upsert into history
    await x.run(`
      INSERT INTO store_health_history (
        company_id, score_date, overall_score, grade,
        spend_efficiency_score, retention_trend_score, engagement_score, review_sentiment_score,
        top_strength, biggest_weakness, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, score_date) DO UPDATE SET
        overall_score = excluded.overall_score,
        grade = excluded.grade,
        spend_efficiency_score = excluded.spend_efficiency_score,
        retention_trend_score = excluded.retention_trend_score,
        engagement_score = excluded.engagement_score,
        review_sentiment_score = excluded.review_sentiment_score,
        top_strength = excluded.top_strength,
        biggest_weakness = excluded.biggest_weakness,
        metadata = excluded.metadata
    `, [
      companyId, today, overallScore, grade,
      spendEfficiencyScore, retentionScore, engagementScore, sentimentScore,
      topStrength, biggestWeakness, JSON.stringify({ actions: signals })
    ]);

    return {
      score_date: today,
      overall_score: overallScore,
      grade,
      score_change: scoreChange,
      components: scores,
      top_strength: topStrength,
      biggest_weakness: biggestWeakness,
      recommended_actions: signals
    };
  });
}

async function getChannelROIRanking(companyId) {
  return withExecutor(async (x) => {
    const today = new Date().toISOString().split('T')[0];
    const { getCampaignPerformance } = require('./marketingMetricsService');
    const campaigns = await getCampaignPerformance(x, companyId);

    // 1. Fetch channel costs configuration to get default costs if needed
    const costs = await x.all(`SELECT channel, cost_per_message FROM channel_costs WHERE company_id = ?`, [companyId]);
    const costMap = {};
    costs.forEach(c => { costMap[c.channel] = c.cost_per_message; });
    if (costs.length === 0) {
      costMap['whatsapp'] = 0.80;
      costMap['sms'] = 0.15;
      costMap['email'] = 0.05;
      costMap['push'] = 0.00;
    }

    const channelStats = {};

    campaigns.forEach(camp => {
      camp.channelsUsed.forEach(chUsage => {
        const ch = chUsage.channel;
        if (!channelStats[ch]) {
          channelStats[ch] = {
            channel: ch,
            revenue: 0,
            campaign_cost: 0,
            messages: 0,
            target_customers: 0,
            conversions: 0
          };
        }

        channelStats[ch].messages += chUsage.msgs;
        // In this simple model, we assign the campaign's full base cost and revenue to the channel
        // assuming mostly 1 channel per campaign
        channelStats[ch].revenue += camp.revenue;
        channelStats[ch].campaign_cost += (camp.base_cost || 0);

        // Estimate conversions: if revenue > 0, assume some % of targets converted.
        const targets = camp.target_count || 1; // avoid division by zero
        channelStats[ch].target_customers += targets;

        if (camp.revenue > 0 && targets > 0) {
           const estimatedConversions = Math.min(targets, Math.ceil(camp.revenue / 500));
           channelStats[ch].conversions += estimatedConversions;
        }
      });
    });

    const results = [];

    // 3. Compute ROI per channel
    for (const [ch, stats] of Object.entries(channelStats)) {
      const msgCost = stats.messages * (costMap[ch] || 0);
      const totalCost = stats.campaign_cost + msgCost;
      const totalRev = stats.revenue;

      let roi = 0;
      if (totalCost > 0) {
        roi = (totalRev - totalCost) / totalCost;
      } else if (totalRev > 0) {
        roi = totalRev / 100; // arbitrary high ROI if 0 cost
      }

      const conversionRate = stats.target_customers > 0
        ? ((stats.conversions / stats.target_customers) * 100).toFixed(1)
        : 0;

      // Fetch trend
      const lastSnapshot = await x.get(`
        SELECT roi
        FROM channel_roi_history
        WHERE company_id = ? AND channel = ? AND snapshot_date < ?
        ORDER BY snapshot_date DESC LIMIT 1
      `, [companyId, ch, today]);

      let trend = 'same';
      if (lastSnapshot) {
        if (roi > lastSnapshot.roi) trend = 'up';
        else if (roi < lastSnapshot.roi) trend = 'down';
      }

      // Upsert snapshot
      await x.run(`
        INSERT INTO channel_roi_history (
          company_id, channel, snapshot_date, total_spend, total_revenue, roi, messages_sent, conversion_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, channel, snapshot_date) DO UPDATE SET
          total_spend = excluded.total_spend,
          total_revenue = excluded.total_revenue,
          roi = excluded.roi,
          messages_sent = excluded.messages_sent,
          conversion_rate = excluded.conversion_rate
      `, [companyId, ch, today, totalCost, totalRev, roi, stats.messages, parseFloat(conversionRate)]);

      results.push({
        channel: ch,
        revenue: totalRev,
        cost: totalCost,
        roi: Number(roi.toFixed(2)),
        messages: stats.messages,
        conversionRate: parseFloat(conversionRate),
        trend
      });
    }

    // Sort by ROI descending
    results.sort((a, b) => b.roi - a.roi);

    return { channels: results };
  });
}

async function getSuggestedBudgetSplit(companyId, requestedBudget) {
  return withExecutor(async (x) => {
    let targetBudget = requestedBudget;
    if (!targetBudget) {
      const dateExpr = x.engine === 'postgres'
        ? `AND created_at >= (now() - interval '90 days')`
        : `AND created_at >= date('now', '-90 days')`;
      const avg = await x.get(`SELECT AVG(campaign_cost) as avg_cost FROM marketing_campaigns WHERE company_id = ? ${dateExpr}`, [companyId]);
      targetBudget = avg && avg.avg_cost ? Math.round(avg.avg_cost) : 5000;
      if (targetBudget <= 0) targetBudget = 5000;
    }

    const { channels } = await getChannelROIRanking(companyId);

    // Get max values for normalization
    let maxRoi = 0, maxConv = 0, maxReach = 0;
    channels.forEach(ch => {
      if (ch.roi > maxRoi) maxRoi = ch.roi;
      if (ch.conversionRate > maxConv) maxConv = ch.conversionRate;
      if (ch.messages > maxReach) maxReach = ch.messages;
    });

    const { getConfidenceScore } = require('./marketingMetricsService');
    const signalScore = await getConfidenceScore(x, companyId, 'budget', 50);

    // Filter positive ROI and calculate scores
    let positiveChannels = channels.filter(ch => ch.roi > 0);

    // If no positive channels, fallback to even split among all channels or just top 1 by reach
    if (positiveChannels.length === 0 && channels.length > 0) {
      // Just pick the one with most reach or default to WhatsApp
      positiveChannels = [channels[0]];
    }

    const scoredChannels = positiveChannels.map(ch => {
      const normRoi = maxRoi > 0 ? (ch.roi / maxRoi) * 100 : 0;
      const normConv = maxConv > 0 ? (ch.conversionRate / maxConv) * 100 : 0;
      const normReach = maxReach > 0 ? (ch.messages / maxReach) * 100 : 0;
      const trendScore = ch.trend === 'up' ? 100 : (ch.trend === 'same' ? 50 : 0);

      const weightedScore =
        (normRoi * 0.40) +
        (normConv * 0.25) +
        (signalScore * 0.15) +
        (trendScore * 0.10) +
        (normReach * 0.10);

      return { ...ch, score: weightedScore };
    });

    let totalScore = scoredChannels.reduce((sum, ch) => sum + ch.score, 0);

    let allocations = [];
    let reasoning = [];
    let totalAllocated = 0;

    if (scoredChannels.length === 1) {
      // Cap at 80%
      const amount = Math.floor(targetBudget * 0.80);
      allocations.push({
        channel: scoredChannels[0].channel,
        amount,
        percentage: 80,
        expectedRevenue: Math.round(amount * (1 + scoredChannels[0].roi))
      });
      reasoning.push(`${scoredChannels[0].channel} is your only profitable channel. Capping allocation at 80% to diversify risk.`);
      totalAllocated = amount;
    } else if (scoredChannels.length > 1) {
      // Initial proportional allocation
      let rawAlloc = scoredChannels.map(ch => {
        let pct = (ch.score / totalScore) * 100;
        return { ...ch, pct };
      });

      // Enforce min 10% and max 70%
      let overage = 0;
      let underage = 0;

      rawAlloc.forEach(ch => {
        if (ch.pct < 10) {
          underage += (10 - ch.pct);
          ch.pct = 10;
          ch.fixed = true;
        } else if (ch.pct > 70) {
          overage += (ch.pct - 70);
          ch.pct = 70;
          ch.fixed = true;
        }
      });

      // Rebalance overage/underage among non-fixed channels
      const balance = overage - underage;
      const nonFixed = rawAlloc.filter(ch => !ch.fixed);
      if (nonFixed.length > 0 && Math.abs(balance) > 0.01) {
        const nonFixedScoreSum = nonFixed.reduce((sum, ch) => sum + ch.score, 0);
        nonFixed.forEach(ch => {
          ch.pct += (ch.score / nonFixedScoreSum) * balance;
        });
      }

      // Convert to amounts
      let remaining = targetBudget;
      rawAlloc.forEach((ch, i) => {
        let amount = (i === rawAlloc.length - 1) ? remaining : Math.round(targetBudget * (ch.pct / 100));
        remaining -= amount;

        allocations.push({
          channel: ch.channel,
          amount,
          percentage: Math.round(ch.pct),
          expectedRevenue: Math.round(amount * (1 + ch.roi))
        });

        if (ch.pct === 70) reasoning.push(`${ch.channel} has produced the highest ROI and Conversion. Maxing allocation at 70%.`);
        else if (ch.trend === 'down') reasoning.push(`${ch.channel} performance has declined. Reduced allocation to mitigate risk.`);
        else if (ch.pct === 10) reasoning.push(`${ch.channel} has positive returns but low volume. Allocated 10% for testing.`);
        else reasoning.push(`${ch.channel} continues to provide stable returns based on recent audience reach.`);
      });
    }

    if (allocations.length === 0) {
      // Fallback
      allocations.push({
        channel: 'whatsapp',
        amount: targetBudget,
        percentage: 100,
        expectedRevenue: targetBudget
      });
      reasoning.push("No historical data available. Suggesting WhatsApp as the default high-engagement channel.");
    }

    const expectedTotalRevenue = allocations.reduce((s, a) => s + (a.expectedRevenue || 0), 0);
    const expectedROI = (expectedTotalRevenue - targetBudget) / targetBudget;

    // Revenue range +/- 10%
    const minRev = Math.round(expectedTotalRevenue * 0.90);
    const maxRev = Math.round(expectedTotalRevenue * 1.10);

    return {
      recommendedBudget: targetBudget,
      expectedRevenueRange: { min: minRev, max: maxRev },
      expectedROI: Number(expectedROI.toFixed(2)),
      confidence: Math.round(signalScore),
      allocation: allocations,
      reasoning: [...new Set(reasoning)] // deduplicate
    };
  });
}

async function getSegmentSpendPriority(companyId, timeframe = '30') {
  return withExecutor(async (x) => {
    let dateFilter = '';
    if (timeframe === '30') dateFilter = daysAgoExpr(x, 30);
    else if (timeframe === '90') dateFilter = daysAgoExpr(x, 90);
    else if (timeframe === '365') dateFilter = daysAgoExpr(x, 365);

    const { getCampaignPerformance, getConfidenceScore } = require('./marketingMetricsService');
    const campaigns = await getCampaignPerformance(x, companyId, dateFilter);

    // Group by segment
    const segmentStats = {};
    campaigns.forEach(camp => {
      if (!camp.segment) return;
      const rawSeg = camp.segment.toLowerCase().replace(/ /g, '_');
      if (!segmentStats[rawSeg]) {
        segmentStats[rawSeg] = {
          raw_seg: rawSeg,
          display_name: camp.segment,
          total_spend: 0,
          total_rev: 0,
          total_targeted: 0,
          total_converted: 0,
          campaign_count: 0
        };
      }
      segmentStats[rawSeg].total_spend += camp.totalCost;
      segmentStats[rawSeg].total_rev += camp.revenue;
      segmentStats[rawSeg].total_targeted += (camp.target_count || 0);
      segmentStats[rawSeg].total_converted += (camp.customers_converted || 0);
      segmentStats[rawSeg].campaign_count += 1;
    });

    const { getAllSegmentSummaries } = require('./segmentationEngine');
    const segSummaries = (await getAllSegmentSummaries(companyId)) || [];
    const sizeMap = {};
    segSummaries.forEach(s => { sizeMap[s.id] = s.count; });

    let maxRoi = 0, maxRpc = 0, maxConv = 0;

    const rawSegments = await Promise.all(Object.values(segmentStats).map(async seg => {
      const roi = seg.total_spend > 0 ? (seg.total_rev - seg.total_spend) / seg.total_spend : (seg.total_rev > 0 ? seg.total_rev / 100 : 0);
      let audienceSize = sizeMap[seg.raw_seg] || seg.total_targeted || 1;
      const rpc = seg.total_rev / (audienceSize || 1);
      const convRate = seg.total_targeted > 0 ? (seg.total_converted / seg.total_targeted) * 100 : 0;

      if (roi > maxRoi) maxRoi = roi;
      if (rpc > maxRpc) maxRpc = rpc;
      if (convRate > maxConv) maxConv = convRate;

      const conf = await getConfidenceScore(x, companyId, seg.display_name, 50);

      return {
        id: seg.raw_seg,
        name: seg.display_name,
        audienceSize,
        spend: seg.total_spend,
        revenue: seg.total_rev,
        roi,
        rpc,
        convRate,
        confidence: conf,
        campaignCount: seg.campaign_count
      };
    }));

    const segments = rawSegments.map(seg => {
      const normRoi = maxRoi > 0 ? (Math.max(0, seg.roi) / maxRoi) * 100 : 0;
      const normRpc = maxRpc > 0 ? (seg.rpc / maxRpc) * 100 : 0;
      const normConv = maxConv > 0 ? (seg.convRate / maxConv) * 100 : 0;

      // Mock trend for now (if ROI > 1.5, we say it's growing)
      const trendScore = seg.roi > 1.5 ? 100 : (seg.roi > 0 ? 50 : 0);

      // Priority Score = ROI(35%) + RPC(25%) + Conv(20%) + Signal(10%) + Trend(10%)
      const priorityScore = Math.round(
        (normRoi * 0.35) +
        (normRpc * 0.25) +
        (normConv * 0.20) +
        (seg.confidence * 0.10) +
        (trendScore * 0.10)
      );

      // Status logic
      let status = '✅ Maintain';
      let suggestedSpend = 0;
      let expectedGain = 0;

      if (priorityScore >= 80) {
        status = '🚀 Scale Aggressively';
        suggestedSpend = Math.round(seg.spend * 1.5) || 5000;
      } else if (priorityScore >= 60) {
        status = '🔥 Increase Spend';
        suggestedSpend = Math.round(seg.spend * 0.5) || 2500;
      } else if (priorityScore >= 40) {
        status = '✅ Maintain';
        suggestedSpend = 0;
      } else if (priorityScore >= 20) {
        status = '⚠️ Test New Offer';
        suggestedSpend = 1000;
      } else {
        status = '❌ Pause Paid Ads';
        suggestedSpend = 0;
      }

      if (suggestedSpend > 0) {
        expectedGain = Math.round(suggestedSpend * (1 + seg.roi));
      }

      return {
        id: seg.id,
        name: seg.name,
        priorityScore,
        roi: Number(seg.roi.toFixed(2)),
        spend: seg.spend,
        revenue: seg.revenue,
        audienceSize: seg.audienceSize,
        rpc: Number(seg.rpc.toFixed(2)),
        convRate: Number(seg.convRate.toFixed(1)),
        confidence: Math.round(seg.confidence),
        status,
        suggestedSpend,
        expectedGain
      };
    });

    // Sort by priorityScore descending
    segments.sort((a, b) => b.priorityScore - a.priorityScore);

    const totalProjected = segments.reduce((s, a) => s + (a.expectedGain || 0), 0);
    const topRec = segments.length > 0
      ? (segments[0].status.includes('Scale') || segments[0].status.includes('Increase')
          ? `Allocate ₹${segments[0].suggestedSpend.toLocaleString()} to ${segments[0].name} to gain ₹${segments[0].expectedGain.toLocaleString()}.`
          : `Maintain spend on ${segments[0].name}.`)
      : 'No segment data available for this timeframe.';

    return {
      generatedAt: new Date().toISOString(),
      topRecommendation: topRec,
      totalProjectedRevenue: totalProjected,
      segments
    };
  });
}

async function getBreakEvenCalculator(companyId, timeframe = '1year') {
  return withExecutor(async (x) => {
    const { getStoreEconomics, getConfidenceScore } = require('./marketingMetricsService');
    const eco = await getStoreEconomics(x, companyId, timeframe);

    const immediateCAC = eco.aov * eco.margin;
    const ltvCAC = eco.ltv * eco.margin;

    const profitZones = [
      { name: 'Safe', min: 0, max: Math.round(immediateCAC), label: '🟢 Safe Zone' },
      { name: 'Moderate', min: Math.round(immediateCAC) + 1, max: Math.round(ltvCAC), label: '🟡 Moderate Zone' },
      { name: 'Loss', min: Math.round(ltvCAC) + 1, max: null, label: '🔴 Loss Zone' }
    ];

    const confidence = await getConfidenceScore(x, companyId, 'break_even', 94);

    return {
      grossMargin: Number((eco.margin * 100).toFixed(1)),
      ltv: Math.round(eco.ltv),
      aov: Math.round(eco.aov),
      purchaseFrequency: Number(eco.purchaseFrequency.toFixed(1)),
      immediateCAC: Math.round(immediateCAC),
      ltvCAC: Math.round(ltvCAC),
      profitZones,
      confidence: Math.round(confidence)
    };
  });
}

async function getWeeklyRecommendation(companyId) {
  try {
    const segmentsData = await getSegmentSpendPriority(companyId, '30');
    if (segmentsData.segments && segmentsData.segments.length > 0) {
      const topSegment = segmentsData.segments[0];
      if (topSegment.status.includes('Scale') || topSegment.status.includes('Increase')) {
        return {
          recommendation: `Allocate ₹${topSegment.suggestedSpend.toLocaleString()} to ${topSegment.name} to gain ₹${topSegment.expectedGain.toLocaleString()}.`,
          type: 'scale'
        };
      }
    }

    const { channels } = await getChannelROIRanking(companyId);
    if (channels && channels.length > 0) {
      const topChannel = channels[0];
      if (topChannel.roi > 1.0) {
        return {
          recommendation: `Double down on ${topChannel.channel} – it's generating a ${(topChannel.roi * 100).toFixed(0)}% return.`,
          type: 'channel'
        };
      }
    }

    return {
      recommendation: `Maintain current spending levels. Gather more data to unlock deeper insights.`,
      type: 'maintain'
    };
  } catch (e) {
    console.error('getWeeklyRecommendation error:', e);
    return { recommendation: 'Review your overall store health to find optimization opportunities.', type: 'default' };
  }
}

async function getPostSpendReportCards(companyId) {
  return withExecutor(async (x) => {
    const { getCampaignPerformance } = require('./marketingMetricsService');
    const campaigns = await getCampaignPerformance(x, companyId);

    // Sort by most recently completed (we don't have completed_at, so use id assuming chronological)
    campaigns.sort((a, b) => b.id - a.id);
    const recent = campaigns.slice(0, 5);

    return recent.map(c => {
      let grade = 'F';
      if (c.roi >= 2.0) grade = 'A';
      else if (c.roi >= 1.0) grade = 'B';
      else if (c.roi > 0) grade = 'C';
      else if (c.roi > -0.5) grade = 'D';

      return {
        id: c.id,
        name: c.name || `Campaign #${c.id}`,
        spend: c.totalCost,
        revenue: c.revenue,
        roi: Number(c.roi.toFixed(2)),
        grade
      };
    });
  });
}

async function getDoNotSpendFlags(companyId) {
  return withExecutor(async (x) => {
    const { getCampaignPerformance } = require('./marketingMetricsService');
    const campaigns = await getCampaignPerformance(x, companyId);

    const channelMap = {};
    const segmentMap = {};

    campaigns.forEach(c => {
      // Channels
      c.channelsUsed.forEach(ch => {
        if (!channelMap[ch.channel]) channelMap[ch.channel] = { spend: 0, rev: 0, count: 0 };
        channelMap[ch.channel].spend += (c.base_cost || 0) + ch.cost; // roughly
        channelMap[ch.channel].rev += c.revenue;
        channelMap[ch.channel].count++;
      });
      // Segments
      if (c.segment) {
        const seg = c.segment;
        if (!segmentMap[seg]) segmentMap[seg] = { spend: 0, rev: 0, count: 0 };
        segmentMap[seg].spend += c.totalCost;
        segmentMap[seg].rev += c.revenue;
        segmentMap[seg].count++;
      }
    });

    const flags = [];

    for (const [ch, data] of Object.entries(channelMap)) {
      if (data.count >= 2) {
        const roi = data.spend > 0 ? (data.rev - data.spend) / data.spend : 0;
        if (roi < 0) {
          flags.push({ type: 'channel', target: ch, reason: `Consistently losing money (ROI: ${Math.round(roi*100)}% across ${data.count} campaigns).` });
        }
      }
    }

    for (const [seg, data] of Object.entries(segmentMap)) {
      if (data.count >= 2) {
        const roi = data.spend > 0 ? (data.rev - data.spend) / data.spend : 0;
        if (roi < 0) {
          flags.push({ type: 'segment', target: seg, reason: `Consistently unprofitable segment (ROI: ${Math.round(roi*100)}% across ${data.count} campaigns).` });
        }
      }
    }

    return flags;
  });
}

module.exports = {
  calculateStoreHealthScore,
  getChannelROIRanking,
  getSuggestedBudgetSplit,
  getSegmentSpendPriority,
  getBreakEvenCalculator,
  getWeeklyRecommendation,
  getPostSpendReportCards,
  getDoNotSpendFlags
};
