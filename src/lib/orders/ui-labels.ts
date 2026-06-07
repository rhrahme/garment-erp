/** Copy for QC production orders vs admin sales orders (same routes, different framing). */
export function ordersUiLabels(productionMode: boolean) {
  if (productionMode) {
    return {
      nav: "Production Orders",
      listTitle: "Production Orders",
      listDescription:
        "Create bespoke client orders with fabrics and garment labels — print stickers and run receiving through production. No pricing shown.",
      newTitle: "New production order",
      newDescription:
        "Select a client, add fabrics with meters and garment labels — then print sticker packs and continue on the production floor.",
      newButton: "+ New production order",
      createOne: "Create production order",
      createMany: (count: number) => `Create ${count} production orders`,
      emptyTitle: "No production orders yet",
      emptyDescription: "Create your first order to assign fabrics, print labels, and start receiving.",
      workflowTitle: "Production workflow",
      workflowSteps: [
        "Create an order with client, fabrics, meters, and garment labels",
        "Print label packs and fabric-cut stickers from the order page",
        "Receive fabric and scan through wash, iron, cutting, and sewing",
      ],
      allOrdersLink: "← All production orders",
      duplicateTitle: "Duplicate order for another client",
      fabricsSectionTitle: "Order fabrics",
      fabricsSectionDescription:
        "Fabrics grouped by supplier for reference — pricing is hidden on QC accounts.",
      detailNewButton: "New production order",
    };
  }

  return {
    nav: "Sales Orders",
    listTitle: "Sales Orders",
    listDescription:
      "Bespoke client orders — fabric POs by supplier. Ready-made retail batches are under Ready-Made.",
    newTitle: "New Sales Order",
    newDescription:
      "Select a client, add fabrics — use client tabs to copy the same articles for another client with different meters.",
    newButton: "+ New Sales Order",
    createOne: "Create sales order",
    createMany: (count: number) => `Create ${count} sales orders`,
    emptyTitle: "No sales orders yet",
    emptyDescription: "Create your first order to start the fabric PO workflow.",
    workflowTitle: "Workflow",
    workflowSteps: [
      "Create a sales order with client + fabrics",
      "System groups fabrics by supplier (Caccioppoli, Zegna, Drapers…)",
      "Review and send one email per supplier",
    ],
    allOrdersLink: "← All orders",
    duplicateTitle: "Duplicate order for another client",
    fabricsSectionTitle: "Fabrics by supplier",
    fabricsSectionDescription:
      "One consolidated email will be created per supplier. Send them from Supplier Emails in the sidebar.",
    detailNewButton: "New sales order",
  };
}
