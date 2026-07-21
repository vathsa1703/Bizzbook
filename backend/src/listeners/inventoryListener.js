const eventBusService = require('../services/EventBusService');
const { Events } = require('../constants/events');
const { getDb } = require('../config/db');

function initInventoryListener() {
  eventBusService.subscribe(Events.INVOICE_CREATED, async (payload, eventRecord) => {
    const db = getDb();

    // NOTE: stock is already decremented synchronously inside the sale's own
    // transaction (routes/sales.js, before INVOICE_CREATED is emitted) — this
    // listener must NOT decrement it again, or every sale double-deducts stock.
    // This handler's only job is low-stock detection/notification.
    try {
      for (const item of payload.items) {
        if (item.product_id) {
          // Check if low stock to emit inventory.low.v1
          const inv = db.prepare('SELECT id, stock_quantity, reorder_level FROM inventory WHERE product_id = ? AND company_id = ?').get(item.product_id, payload.companyId);
          if (inv && inv.stock_quantity <= (inv.reorder_level || 5)) {
            eventBusService.emit(payload.companyId, Events.INVENTORY_LOW, inv.id, {
              inventoryId: inv.id,
              productId: item.product_id,
              productName: item.product_name,
              companyId: payload.companyId,
              currentStock: inv.stock_quantity,
              reorderLevel: inv.reorder_level || 5,
              timestamp: new Date().toISOString()
            }, eventRecord.correlationId);
          }
        }
      }
    } finally {
      db.close();
    }
  });
}

module.exports = { initInventoryListener };
