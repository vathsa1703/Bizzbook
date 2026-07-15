const eventBusService = require('../services/EventBusService');
const { Events } = require('../constants/events');
const { getDb } = require('../config/db');

function initInventoryListener() {
  eventBusService.subscribe(Events.INVOICE_CREATED, async (payload, eventRecord) => {
    const db = getDb();
    
    db.exec('BEGIN TRANSACTION');
    try {
      for (const item of payload.items) {
        if (item.product_id) {
          db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?')
            .run(item.quantity, item.product_id, payload.companyId);
            
          // Check if low stock to emit inventory.low.v1
          const inv = db.prepare('SELECT id, stock_quantity, min_stock_level FROM inventory WHERE product_id = ? AND company_id = ?').get(item.product_id, payload.companyId);
          if (inv && inv.stock_quantity <= (inv.min_stock_level || 5)) {
            eventBusService.emit(payload.companyId, Events.INVENTORY_LOW, inv.id, {
              inventoryId: inv.id,
              productId: item.product_id,
              productName: item.product_name,
              companyId: payload.companyId,
              currentStock: inv.stock_quantity,
              reorderLevel: inv.min_stock_level || 5,
              timestamp: new Date().toISOString()
            }, eventRecord.correlationId);
          }
        }
      }
      db.exec('COMMIT');
      console.log(`[InventoryListener] Deducted stock for invoice ${payload.invoiceNumber}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err; // EventBus will catch and mark as failed
    }
  });
}

module.exports = { initInventoryListener };
