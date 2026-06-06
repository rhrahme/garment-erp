/** Orders with order_date before this cutoff are treated as archived in the list UI. */
export const SALES_ORDER_ARCHIVE_AGE_MONTHS = 3;

export function salesOrderArchiveCutoffDate(referenceDate = new Date()): string {
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - SALES_ORDER_ARCHIVE_AGE_MONTHS);
  return cutoff.toISOString().slice(0, 10);
}

export function isSalesOrderArchived(
  order: { order_date: string },
  referenceDate = new Date()
): boolean {
  return order.order_date < salesOrderArchiveCutoffDate(referenceDate);
}
