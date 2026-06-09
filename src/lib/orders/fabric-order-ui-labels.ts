/** Copy for the Fabric Orders tab (QC input + admin supplier email). */
export function fabricOrderUiLabels(isClientManager: boolean) {
  if (isClientManager) {
    return {
      nav: "Fabric Orders",
      listTitle: "Fabric Orders",
      listDescription:
        "Request fabric from suppliers — add client, fabrics, meters, and garment type. Admin sends supplier emails after you submit.",
      newTitle: "New fabric order",
      newDescription: "Select a client and add fabrics with meters and garment type (e.g. 3 m for a suit).",
      newButton: "+ New fabric order",
      workflowTitle: "Fabric order workflow",
      workflowSteps: [
        "Create an order and add fabrics with meters and garment type",
        "Choose where suppliers ship fabric (Riyadh or Dubai)",
        "Submit the order — admin will email suppliers",
      ],
      allOrdersLink: "← All fabric orders",
      detailNewButton: "New fabric order",
      fabricsSectionTitle: "Fabrics to order",
      fabricsSectionDescription:
        "Grouped by supplier. A suit needs 2 factory labels (jacket + trouser) — set automatically from garment type.",
      submitButton: "Submit for supplier ordering",
      submitHint: "Admin will review and send supplier emails — you will not email suppliers from this account.",
      submittedBadge: "Submitted — waiting for admin",
    };
  }

  return {
    nav: "Fabric Orders",
    listTitle: "Fabric Orders",
    listDescription:
      "QC fabric order requests — review pending orders and send supplier emails when ready.",
    newTitle: "New fabric order",
    newDescription: "Create a sales order with fabrics, or open a QC-submitted request to email suppliers.",
    newButton: "+ New fabric order",
    workflowTitle: "Admin workflow",
    workflowSteps: [
      "Review QC-submitted fabric orders (or create orders directly)",
      "Create supplier fabric POs and send one email per supplier",
      "Track replies in Supplier Inbox",
    ],
    allOrdersLink: "← All fabric orders",
    detailNewButton: "New fabric order",
    fabricsSectionTitle: "Fabrics by supplier",
    fabricsSectionDescription: "One consolidated email per supplier. Create POs then send from this page or Supplier Emails.",
    submitButton: "Mark as submitted",
    submitHint: "Use when you created the order yourself — marks it ready for supplier emails.",
    submittedBadge: "Submitted",
  };
}
