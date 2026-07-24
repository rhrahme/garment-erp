/** Copy for QC production orders vs admin sales orders (same routes, different framing). */
export function ordersUiLabels(
  productionMode: boolean,
  taskOperatorMode = false,
  productionOperatorMode = false
) {
  if (productionOperatorMode) {
    return {
      nav: "Factory orders",
      listTitle: "Factory orders",
      listDescription:
        "Operational orders for the factory floor — watch wash/iron, advance cut→finish, hand to delivery. No pricing shown.",
      newTitle: "Factory orders",
      newDescription: "Factory managers cannot create orders — open an existing order for floor work.",
      newButton: "",
      createOne: "Create production order",
      createMany: (count: number) => `Create ${count} production orders`,
      emptyTitle: "No factory orders yet",
      emptyDescription: "Orders with fabrics will appear here for floor management.",
      workflowTitle: "Factory manager workflow",
      workflowSteps: [
        "Watch wash & iron progress on Fabric Receiving (Task scans; you can advance)",
        "Open Factory floor to see pieces by client and stage",
        "Scan or advance: cut → finish → hand to delivery driver",
        "Flag fabric defects for QC when found on the floor",
      ],
      allOrdersLink: "← All factory orders",
      duplicateTitle: "Duplicate order for another client",
      fabricsSectionTitle: "Production labels",
      fabricsSectionDescription: "View assigned fabrics for floor tracking. Pricing is hidden.",
      detailNewButton: "New production order",
    };
  }

  if (taskOperatorMode) {
    return {
      nav: "Print orders",
      listTitle: "Print orders",
      listDescription:
        "Find a production order to print A4 sheets and label stickers. Scan wash and iron at Fabric Receiving. No pricing shown.",
      newTitle: "Print orders",
      newDescription: "Task operators cannot create orders — open an existing order to print labels.",
      newButton: "",
      createOne: "Create production order",
      createMany: (count: number) => `Create ${count} production orders`,
      emptyTitle: "No production orders yet",
      emptyDescription: "Orders with fabrics will appear here for printing and scanning.",
      workflowTitle: "Floor workflow",
      workflowSteps: [
        "Open an order that already has fabrics assigned",
        "Print fabric-cut stickers per line (receive / wash) — use Print orders or Fabric Receiving",
        "After wash & iron, print cutting stickers for multi-piece garments (suit = jacket + trouser)",
        "Scan fabrics at Fabric Receiving — wash and iron stations",
      ],
      allOrdersLink: "← All print orders",
      duplicateTitle: "Duplicate order for another client",
      fabricsSectionTitle: "Production labels",
      fabricsSectionDescription: "View assigned fabrics and print sticker packs. Pricing is hidden.",
      detailNewButton: "New production order",
    };
  }

  if (productionMode) {
    return {
      nav: "Production Orders",
      listTitle: "Production Orders",
      listDescription:
        "Print labels and run receiving through production. Add fabrics on the Fabric Orders tab first. No pricing shown.",
      newTitle: "New production order",
      newDescription:
        "Select a client — fabrics are added on Fabric Orders. Here you print sticker packs and run the production floor.",
      newButton: "+ New production order",
      createOne: "Create production order",
      createMany: (count: number) => `Create ${count} production orders`,
      emptyTitle: "No production orders yet",
      emptyDescription: "Create your first order to assign fabrics, print labels, and start receiving.",
      workflowTitle: "Production workflow",
      workflowSteps: [
        "Open an order with fabrics (added on Fabric Orders) — suits show 2 production labels (jacket + trouser)",
        "Print label packs and fabric-cut stickers from the order page",
        "Receive fabric and scan through wash, iron, cutting, and sewing",
      ],
      allOrdersLink: "← All production orders",
      duplicateTitle: "Duplicate order for another client",
      fabricsSectionTitle: "Production labels",
      fabricsSectionDescription:
        "Piece labels per garment — a suit fabric line generates jacket and trouser stickers. Pricing is hidden on QC accounts.",
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
