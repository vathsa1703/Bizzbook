'use strict';
const express = require('express');
const { getAllStates, getStateByCode, resolveStateCode } = require('../services/gstEngine');

const router = express.Router();

// GET /api/gst-states — full list
router.get('/', (req, res) => {
  res.json(getAllStates());
});

// GET /api/gst-states/:code — single state by code
router.get('/:code', (req, res) => {
  const state = getStateByCode(req.params.code);
  if (!state) return res.status(404).json({ error: 'State not found' });
  res.json(state);
});

// GET /api/gst-states/resolve/:value — resolve name or code → canonical entry
router.get('/resolve/:value', (req, res) => {
  const code  = resolveStateCode(decodeURIComponent(req.params.value));
  const state = code ? getStateByCode(code) : null;
  if (!state) return res.status(404).json({ error: 'Cannot resolve state', input: req.params.value });
  res.json(state);
});

module.exports = router;
