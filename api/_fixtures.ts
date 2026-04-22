// Static fixture data for the Vercel demo deploy; writes do not persist.
// Kept in sync with infra/seed/index.ts, which round-trips this snapshot
// into the local Postgres DB so `pnpm seed` produces the same content.
//
// Yiswa is a reverse-auction e-commerce app in Kuwait. Customers buy via
// "Buy Now" or "Set Price Target" on descending-price auctions. The AI
// customer service agent is named Noor. Source material lives under
// /brain docs/ (Help Center, Cancelation & Return, Yiswa Automation
// Project - Welcome Coupon, Noor Enhancement Plan, Tech Integration Reqs).

export const MODULES = [
  {
    id: "14126df4-e36c-451e-a448-d5206c06eff0",
    slug: "escalation_rules",
    label: "Escalation Rules",
    icon: "alert-triangle",
    fieldDefinitions: [
      {
        key: "trigger",
        type: "textarea",
        label: "Trigger",
        required: true,
        localized: false,
      },
      {
        key: "channel",
        type: "select",
        label: "Channel",
        options: ["human_chat", "phone", "email", "whatsapp"],
        required: true,
        localized: false,
      },
      {
        key: "webhook_url",
        type: "url",
        label: "Webhook",
        required: false,
        localized: false,
      },
    ],
  },
  {
    id: "2eeb15ca-2aec-46ad-b680-bfff2e5cd5b3",
    slug: "faqs",
    label: "FAQs (EN + AR)",
    icon: "help-circle",
    fieldDefinitions: [
      {
        key: "question",
        type: "text",
        label: "Question",
        required: true,
        localized: true,
      },
      {
        key: "answer",
        type: "textarea",
        label: "Answer",
        required: true,
        localized: true,
      },
      {
        key: "category",
        type: "text",
        label: "Category",
        required: false,
        localized: false,
      },
    ],
  },
  {
    id: "b265f169-81ec-451c-9b38-ca26e4d28dd9",
    slug: "partners",
    label: "Partners",
    icon: "handshake",
    fieldDefinitions: [
      {
        key: "name",
        type: "text",
        label: "Name",
        required: true,
        localized: false,
      },
      {
        key: "type",
        type: "select",
        label: "Type",
        options: ["Bank", "Loyalty", "Corporate", "Other"],
        required: true,
        localized: false,
      },
      {
        key: "notes",
        type: "textarea",
        label: "Notes",
        required: false,
        localized: true,
      },
    ],
  },
  {
    id: "ed196f30-c108-4935-b3b9-5755ba64cc1b",
    slug: "policy_matrix",
    label: "Policies & Rules",
    icon: "shield",
    fieldDefinitions: [
      {
        key: "scenario",
        type: "text",
        label: "Scenario",
        required: true,
        localized: true,
      },
      {
        key: "policy",
        type: "textarea",
        label: "Policy",
        required: true,
        localized: true,
      },
      {
        key: "exception",
        type: "textarea",
        label: "Exception",
        required: false,
        localized: true,
      },
    ],
  },
  {
    id: "ffebff5c-c9ef-4143-9489-a50b52f7e0a2",
    slug: "promotions",
    label: "Active Offers",
    icon: "tag",
    fieldDefinitions: [
      {
        key: "name",
        type: "text",
        label: "Name",
        required: true,
        localized: false,
      },
      {
        key: "type",
        type: "select",
        label: "Type",
        options: ["Promo", "Seasonal", "Bank"],
        required: true,
        localized: false,
      },
      {
        key: "message",
        type: "textarea",
        label: "Offer description",
        required: true,
        localized: true,
      },
      {
        key: "start_date",
        type: "date",
        label: "Start",
        required: false,
        localized: false,
      },
      {
        key: "end_date",
        type: "date",
        label: "End",
        required: false,
        localized: false,
      },
    ],
  },
] as const;

export const ENTRIES_BY_SLUG: Record<
  string,
  Array<{
    id: string;
    data: Record<string, unknown>;
    status: string;
    updatedAt: string;
  }>
> = {
  escalation_rules: [
    {
      id: "e1000001-0000-0000-0000-000000000001",
      data: {
        channel: "human_chat",
        trigger:
          "Order Status - where is my order, tracking, delivery date. After Noor collects the order number, transfer to Customer Service. SLA: 30 min. Auto: Let me pull up your order details and connect you with our team.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/order-status",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000002-0000-0000-0000-000000000002",
      data: {
        channel: "human_chat",
        trigger:
          "Delivery Issue - order late, not received, driver didn't arrive, wrong address. Noor collects order number, then transfer to Customer Service. SLA: 1 hour. Auto: Sorry about that. Connecting you to a team member to help right away.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/delivery",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000003-0000-0000-0000-000000000003",
      data: {
        channel: "human_chat",
        trigger:
          "Refund Request - refund, money back, استرجاع, فلوسي. Noor collects order number and reason, then transfer to Finance/CS. SLA: 4 hours. Auto: Let me connect you with our team to process your refund request.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/refund",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000004-0000-0000-0000-000000000004",
      data: {
        channel: "human_chat",
        trigger:
          "Cancellation Request (before delivery) - cancel order, إلغاء. Noor asks if the order was delivered; if no, collect order number + reason and transfer to CS. SLA: 2 hours. Auto: Please share your order number and reason; our team will complete the cancellation.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/cancellation",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000005-0000-0000-0000-000000000005",
      data: {
        channel: "human_chat",
        trigger:
          "Return Request (after delivery) - return, إرجاع, defective, damaged, wrong item. Noor asks if delivered; if yes, collect order number, reason, and product-condition photo, then transfer to CS. SLA: 4 hours. Auto: Please share the order number and a photo of the product; our team will complete the return.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/return",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000006-0000-0000-0000-000000000006",
      data: {
        channel: "human_chat",
        trigger:
          "Auction Win Issue - won auction but didn't want, wrong product after winning, فزت بس. Transfer to CS. SLA: 2 hours. Auto: Connecting you to our team to review the auction result.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/auction",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000007-0000-0000-0000-000000000007",
      data: {
        channel: "human_chat",
        trigger:
          "Payment Issue - payment failed, double charge, card declined, الدفع ما مشى. Transfer to Finance/CS. SLA: 2 hours. Auto: Let me connect you to our team to look into the payment.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/payment",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000008-0000-0000-0000-000000000008",
      data: {
        channel: "human_chat",
        trigger:
          "App / Technical Issue - app crash, can't log in, cart not loading, app down. Transfer to Tech Support. SLA: 4 hours. Auto: Thanks for letting us know — connecting you to our tech team.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/technical",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000009-0000-0000-0000-000000000009",
      data: {
        channel: "human_chat",
        trigger:
          "Complaint / Angry Customer - complaint, شكوى, consumer protection, manager. Transfer to CS Manager. SLA: 30 min. Auto: I understand your concern. Connecting you to a team member right away.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/complaint",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "e1000010-0000-0000-0000-000000000010",
      data: {
        channel: "human_chat",
        trigger:
          "Supplier Inquiry - want to list products, supplier, vendor, seller. Transfer to Partnerships/Sales. SLA: 24 hours. Auto: Thanks for your interest — connecting you to the partnerships team.",
        webhook_url: "https://hooks.internal.yiswa.com/escalations/supplier",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
  ],
  faqs: [
    {
      id: "faq00001-0000-0000-0000-000000000001",
      data: {
        category: "App Basics",
        question_en: "What is the idea of the Yiswa app?",
        question_ar: "ما هي فكرة تطبيق يسوا؟",
        answer_en:
          'Yiswa is a reverse-auction app. Each auction starts at the market price and gradually decreases. You can purchase a product either through "Buy Now" if the price suits you, or by using "Set Price Target" — you set your desired price and once the auction reaches it, the card on your profile is charged and the item is awarded to you. The auction ends once the product is sold out.',
        answer_ar:
          'يسوا تطبيق يعتمد على المزاد العكسي. كل مزاد يبدأ بسعر السوق ثم يتناقص تدريجياً. تقدر تشتري المنتج إما عبر "اشتري الآن" إذا ناسبك السعر، أو عبر "حدد سعرك" — تحدد السعر المناسب لك، وعندما يصل المزاد إلى هذا السعر يتم خصم المبلغ من البطاقة المحفوظة في حسابك ويفوز المنتج لك. ينتهي المزاد عند نفاد الكمية.',
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00002-0000-0000-0000-000000000002",
      data: {
        category: "App Basics",
        question_en: "How can I make a purchase on the app?",
        question_ar: "كيف أشتري من التطبيق؟",
        answer_en:
          "Two ways: (1) Buy Now — purchase immediately when the price is right. Select quantity, delivery address, and payment method (credit card or Apple Pay). (2) Set Price Target — set the price you're willing to pay and confirm. If the auction reaches your price, the product is awarded to you automatically. Your card details must be saved in advance.",
        answer_ar:
          "فيه طريقتين: (1) اشتري الآن — اشتري المنتج مباشرة عندما يصل السعر المناسب لك. اختر الكمية وعنوان التوصيل وطريقة الدفع (بطاقة ائتمان أو آبل باي). (2) حدد سعرك — حدد السعر الذي ترغب بدفعه وأكد. إذا وصل المزاد إلى سعرك، يفوز المنتج لك تلقائياً. يشترط حفظ بيانات البطاقة مسبقاً.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00003-0000-0000-0000-000000000003",
      data: {
        category: "Product",
        question_en: "Are the products genuine and new?",
        question_ar: "هل المنتجات أصلية وجديدة؟",
        answer_en:
          "Yes, all products on the app are 100% genuine, new, and covered by local distributor warranties.",
        answer_ar: "نعم، جميع المنتجات في التطبيق أصلية 100% وجديدة ومشمولة بضمان الوكيل المحلي.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00004-0000-0000-0000-000000000004",
      data: {
        category: "Delivery",
        question_en: "Do you offer delivery outside Kuwait?",
        question_ar: "هل يوجد توصيل خارج الكويت؟",
        answer_en:
          "Currently, delivery is only available within Kuwait. We are working on expanding to other GCC countries soon.",
        answer_ar: "التوصيل حالياً داخل الكويت فقط. نعمل على التوسع إلى باقي دول الخليج قريباً.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00005-0000-0000-0000-000000000005",
      data: {
        category: "Delivery",
        question_en: "How can I check the delivery schedule for my order?",
        question_ar: "كيف أعرف موعد توصيل طلبي؟",
        answer_en:
          'You can view delivery dates under "My Orders" in your profile, listed beneath each order.',
        answer_ar: 'تقدر تشوف تواريخ التوصيل من قسم "طلباتي" في ملفك الشخصي، أسفل كل طلب.',
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00006-0000-0000-0000-000000000006",
      data: {
        category: "Returns",
        question_en: "I purchased a product and want to return it. How do I proceed?",
        question_ar: "اشتريت منتج وأبغى أرجعه، كيف أسوي؟",
        answer_en:
          "Please contact Customer Support through the app and explain the reason for return. Once approved by the relevant team, we will reach out to complete the return process.",
        answer_ar:
          "يرجى التواصل مع خدمة العملاء عبر التطبيق مع ذكر سبب الإرجاع. بعد موافقة الفريق المختص، سنتواصل معك لإكمال إجراءات الإرجاع.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00007-0000-0000-0000-000000000007",
      data: {
        category: "Payment",
        question_en: "Do you offer cash on delivery or installment payments?",
        question_ar: "هل يوجد دفع عند الاستلام أو تقسيط؟",
        answer_en: "Currently, payment is only available via credit cards or Apple Pay.",
        answer_ar: "حالياً الدفع متاح فقط عبر البطاقات الائتمانية أو آبل باي.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00008-0000-0000-0000-000000000008",
      data: {
        category: "Group Deal",
        question_en: "What is a Group Deal?",
        question_ar: "ما هو العرض الجماعي (Group Deal)؟",
        answer_en:
          "A Group Deal is a special offer on a limited-quantity product for a specific time. A final discounted price is set in advance. The amount is held until the required number of purchases is reached. If the target is not met, the amount is refunded to your account. You can share the deal with friends and family on social media to help complete the required purchases.",
        answer_ar:
          "العرض الجماعي هو عرض خاص على منتج بكمية محدودة ولمدة محددة، بسعر مخفض نهائي يتم تحديده مسبقاً. يتم حجز المبلغ إلى حين اكتمال العدد المطلوب من المشتريات. إذا لم يكتمل العدد، يُعاد المبلغ إلى حسابك. تقدر تشارك العرض مع أهلك وأصدقائك عبر وسائل التواصل للمساعدة في إكمال المشتريات المطلوبة.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00009-0000-0000-0000-000000000009",
      data: {
        category: "Returns",
        question_en: "I received a defective product and want to exchange it. What should I do?",
        question_ar: "وصلني منتج فيه عيب وأبغى أبدله، وش أسوي؟",
        answer_en:
          "Please contact the Customer Service Team via the app, describe the issue, and attach a video explaining the problem. We will raise a replacement request, replace the item, and collect the original with all its accessories.",
        answer_ar:
          "يرجى التواصل مع فريق خدمة العملاء عبر التطبيق مع شرح المشكلة وإرفاق فيديو يوضحها. سنقوم بفتح طلب استبدال، ونستبدل المنتج، ونسترجع المنتج الأصلي مع جميع ملحقاته.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00010-0000-0000-0000-000000000010",
      data: {
        category: "Cancellation",
        question_en: "How can I cancel my order?",
        question_ar: "كيف ألغي طلبي؟",
        answer_en:
          "To cancel an order, contact the Customer Service Team via the app. The amount will be refunded to your bank account within 1 to 5 business days.",
        answer_ar:
          "لإلغاء الطلب، يرجى التواصل مع فريق خدمة العملاء عبر التطبيق. سيتم استرجاع المبلغ إلى حسابك البنكي خلال 1 إلى 5 أيام عمل.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00011-0000-0000-0000-000000000011",
      data: {
        category: "Payment",
        question_en: "Why didn't my purchase go through?",
        question_ar: "ليش ما تمت عملية الشراء؟",
        answer_en:
          "Possible reasons: insufficient card balance, incorrect card information, product sold out, or expired card. Please contact the Customer Service Team to resolve the issue.",
        answer_ar:
          "الأسباب المحتملة: رصيد البطاقة غير كافٍ، أو معلومات البطاقة غير صحيحة، أو نفاد المنتج، أو انتهاء صلاحية البطاقة. يرجى التواصل مع فريق خدمة العملاء لحل المشكلة.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00012-0000-0000-0000-000000000012",
      data: {
        category: "Orders",
        question_en: "How can I confirm my purchase was successful?",
        question_ar: "كيف أتأكد أن الشراء تم بنجاح؟",
        answer_en:
          'You can verify your purchase status in the "My Orders" section of your profile.',
        answer_ar: 'تقدر تتأكد من حالة الشراء من قسم "طلباتي" في ملفك الشخصي.',
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00013-0000-0000-0000-000000000013",
      data: {
        category: "Account",
        question_en: "Can I add multiple delivery addresses?",
        question_ar: "أقدر أضيف أكثر من عنوان توصيل؟",
        answer_en: "Yes, the app allows you to add and manage multiple delivery addresses.",
        answer_ar: "نعم، التطبيق يسمح لك بإضافة وإدارة أكثر من عنوان توصيل.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00014-0000-0000-0000-000000000014",
      data: {
        category: "Product",
        question_en: "Do all products have warranty?",
        question_ar: "هل جميع المنتجات عليها ضمان؟",
        answer_en:
          "Yes, all products come with a warranty from the authorized local distributor in Kuwait.",
        answer_ar: "نعم، جميع المنتجات عليها ضمان من الوكيل المحلي المعتمد في الكويت.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00015-0000-0000-0000-000000000015",
      data: {
        category: "Returns",
        question_en: "What is the return/exchange policy?",
        question_ar: "ما هي سياسة الإرجاع والاستبدال؟",
        answer_en:
          "You can return or exchange a product within 14 days of delivery, provided it is in its original condition and unused.",
        answer_ar:
          "تقدر ترجع أو تستبدل المنتج خلال 14 يوماً من الاستلام، بشرط أن يكون بحالته الأصلية وغير مستخدم.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00016-0000-0000-0000-000000000016",
      data: {
        category: "Returns",
        question_en:
          "I purchased a product more than 14 days ago and it has an issue. What should I do?",
        question_ar: "اشتريت منتج من أكثر من 14 يوماً وفيه مشكلة، وش أسوي؟",
        answer_en:
          "Please contact the Customer Service Team through the app to get information about the relevant service center.",
        answer_ar:
          "يرجى التواصل مع فريق خدمة العملاء عبر التطبيق للحصول على معلومات مركز الصيانة المختص.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00017-0000-0000-0000-000000000017",
      data: {
        category: "Suppliers",
        question_en: "I'm a supplier and want to list my products on the app. How do I proceed?",
        question_ar: "أنا مورّد وأبغى أدرج منتجاتي في التطبيق، كيف؟",
        answer_en:
          "Please contact the Customer Service Team via the app to submit your request to the relevant department.",
        answer_ar: "يرجى التواصل مع فريق خدمة العملاء عبر التطبيق لرفع طلبك إلى القسم المختص.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00018-0000-0000-0000-000000000018",
      data: {
        category: "Group Deal",
        question_en: "What happens to the reserved amount in a Group Deal?",
        question_ar: "وش يصير بالمبلغ المحجوز في العرض الجماعي؟",
        answer_en:
          "When you join a Group Deal, the advertised amount is reserved (not charged). If the required quantity is not reached within the specified time, the reserved amount will be refunded to your bank account. Some banks may hold the reserved amount for a few days — if that happens, we recommend following up with your bank.",
        answer_ar:
          "عند الانضمام إلى العرض الجماعي، يتم حجز المبلغ المعلن (بدون خصم). إذا لم يكتمل العدد المطلوب خلال المدة المحددة، يتم إرجاع المبلغ المحجوز إلى حسابك البنكي. بعض البنوك قد تحتفظ بالمبلغ المحجوز لبضعة أيام — في هذه الحالة ننصح بمتابعة البنك.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00019-0000-0000-0000-000000000019",
      data: {
        category: "Payment",
        question_en: "I couldn't add my bank card to the app. What should I do?",
        question_ar: "ما قدرت أضيف بطاقتي في التطبيق، وش أسوي؟",
        answer_en:
          "Please contact the Customer Service Team via the app to report the issue, and they will assist you in resolving it.",
        answer_ar:
          "يرجى التواصل مع فريق خدمة العملاء عبر التطبيق للإبلاغ عن المشكلة، وسيقومون بمساعدتك في حلها.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "faq00020-0000-0000-0000-000000000020",
      data: {
        category: "Delivery",
        question_en:
          "The delivery agent called but I didn't answer. When will the delivery be rescheduled?",
        question_ar: "مندوب التوصيل اتصل وما رديت، متى يعيد التوصيل؟",
        answer_en:
          "If the delivery agent couldn't reach you, your delivery will be rescheduled for the next day.",
        answer_ar: "إذا ما قدر مندوب التوصيل يتواصل معك، تتم إعادة جدولة التوصيل في اليوم التالي.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
  ],
  partners: [],
  policy_matrix: [
    {
      id: "pol00001-0000-0000-0000-000000000001",
      data: {
        scenario_en: "Cancellation Before Delivery",
        scenario_ar: "إلغاء قبل التوصيل",
        policy_en:
          'Noor first asks: "Has your order been delivered?" If the answer is No, reply: "Kindly provide the order reference number along with the reason for cancellation, and we will transfer your conversation to our customer service team to proceed with the request."',
        policy_ar:
          'نور تسأل في البداية: هل تم توصيل الطلب لكم؟ إذا كانت الإجابة (لا): "يرجى تزويدنا برقم الطلب وسبب الإلغاء، وسيتم تحويل المحادثة إلى أحد موظفي خدمة العملاء لاستكمال الإجراءات في أقرب وقت."',
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00002-0000-0000-0000-000000000002",
      data: {
        scenario_en: "Return After Delivery",
        scenario_ar: "إرجاع بعد التوصيل",
        policy_en:
          'Noor first asks: "Has your order been delivered?" If the answer is Yes, reply: "Kindly provide the order reference number along with the reason for return, and attach a photo showing that the product is in its original condition and unused. Your conversation will then be transferred to our customer service team to proceed further."',
        policy_ar:
          'نور تسأل في البداية: هل تم توصيل الطلب لكم؟ إذا كانت الإجابة (نعم): "يرجى تزويدنا برقم الطلب وسبب الإرجاع، مع إرفاق صورة توضح أن المنتج في حالته الأصلية وغير مستخدم، وسيتم تحويل المحادثة إلى أحد موظفي خدمة العملاء لاستكمال الإجراءات في أقرب وقت."',
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00003-0000-0000-0000-000000000003",
      data: {
        scenario_en: "14-Day Return Window",
        scenario_ar: "مهلة الإرجاع 14 يوماً",
        policy_en:
          "Products can be returned or exchanged within 14 days of delivery, provided they are in their original condition and unused.",
        policy_ar:
          "يمكن إرجاع أو استبدال المنتجات خلال 14 يوماً من الاستلام، بشرط أن تكون بحالتها الأصلية وغير مستخدمة.",
        exception_en:
          "After 14 days, customer is directed to the authorized distributor service center.",
        exception_ar: "بعد مرور 14 يوماً، يتم توجيه العميل إلى مركز صيانة الوكيل المعتمد.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00004-0000-0000-0000-000000000004",
      data: {
        scenario_en: "Defective Product Exchange",
        scenario_ar: "استبدال منتج معيب",
        policy_en:
          "Customer contacts CS via the app, describes the issue, and attaches a video. A replacement request is raised; the replacement is delivered and the original item is collected with all its accessories.",
        policy_ar:
          "يتواصل العميل مع خدمة العملاء عبر التطبيق، يشرح المشكلة ويرفق فيديو. يتم فتح طلب استبدال، تسليم المنتج البديل واسترجاع المنتج الأصلي مع جميع ملحقاته.",
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00005-0000-0000-0000-000000000005",
      data: {
        scenario_en: "Cancellation Refund Window",
        scenario_ar: "مدة استرجاع المبلغ عند الإلغاء",
        policy_en:
          "When an order is cancelled via CS, the amount is refunded to the customer's bank account within 1 to 5 business days.",
        policy_ar:
          "عند إلغاء الطلب عبر خدمة العملاء، يُعاد المبلغ إلى الحساب البنكي للعميل خلال 1 إلى 5 أيام عمل.",
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00006-0000-0000-0000-000000000006",
      data: {
        scenario_en: "Group Deal Amount Hold",
        scenario_ar: "حجز مبلغ العرض الجماعي",
        policy_en:
          "When a customer joins a Group Deal, the advertised amount is reserved (not charged). If the target quantity is not reached within the specified time, the reserved amount is refunded to the bank account.",
        policy_ar:
          "عند الانضمام إلى عرض جماعي، يتم حجز المبلغ المعلن (دون خصم). إذا لم يكتمل العدد المطلوب خلال المدة المحددة، يُعاد المبلغ المحجوز إلى الحساب البنكي.",
        exception_en:
          "Some banks may continue to hold the reserved amount for a few additional days.",
        exception_ar: "بعض البنوك قد تستمر في حجز المبلغ لبضعة أيام إضافية.",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00007-0000-0000-0000-000000000007",
      data: {
        scenario_en: "Delivery Coverage",
        scenario_ar: "تغطية التوصيل",
        policy_en: "Delivery is available within Kuwait only. GCC expansion is planned.",
        policy_ar: "التوصيل متاح داخل الكويت فقط. يوجد خطة للتوسع إلى دول الخليج.",
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00008-0000-0000-0000-000000000008",
      data: {
        scenario_en: "Accepted Payment Methods",
        scenario_ar: "وسائل الدفع المقبولة",
        policy_en:
          "Payment is accepted via credit card or Apple Pay only. No cash on delivery, no installments.",
        policy_ar:
          "الدفع متاح فقط عبر البطاقة الائتمانية أو آبل باي. لا يوجد دفع عند الاستلام ولا تقسيط.",
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "pol00009-0000-0000-0000-000000000009",
      data: {
        scenario_en: "Failed Delivery Attempt",
        scenario_ar: "محاولة توصيل فاشلة",
        policy_en:
          "If the delivery agent cannot reach the customer, the delivery is rescheduled for the next day.",
        policy_ar:
          "إذا لم يتمكن مندوب التوصيل من التواصل مع العميل، تتم إعادة جدولة التوصيل لليوم التالي.",
        exception_en: "",
        exception_ar: "",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
  ],
  promotions: [
    {
      id: "pro00001-0000-0000-0000-000000000001",
      data: {
        name: "Welcome Coupon",
        type: "Promo",
        start_date: "2026-04-22T00:00:00.000Z",
        end_date: "",
        message_en:
          "Welcome to Yiswa, {{First_Name}}! Now the price is in your hands. Ready for a savings journey — here's a free-delivery coupon for your first order. Coupon code: {{COUPON_CODE}}. Valid for 48 hours.",
        message_ar:
          "مرحبا {{First_Name}}\nمن الحين السعر بيدك\nجاهز لرحلة التوفير\nهذا كوبون توصيل مجاني لأول طلب 🚚\nكود الكوبون: {{COUPON_CODE}}\n⏳ صالح لمدة 48 ساعة",
      },
      status: "active",
      updatedAt: "2026-04-22T00:00:00.000Z",
    },
  ],
};
