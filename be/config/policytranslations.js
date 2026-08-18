const POLICY_TRANSLATIONS = {
    purchase: {
        zh: {
            title: "购买政策",
            summary: "关于在 Nova 购买设备、零部件及技术解决方案时的信息提供、订单确认与处理规定。",
            sections: [
                {
                    title: "购买条件",
                    content: "客户需提供完整的联系方式和收货地址。对于需要配置咨询或显示为“请联系”的产品，Nova 将在确认订单前与客户进一步沟通。"
                },
                {
                    title: "下单流程",
                    content: "选择产品 → 加入购物车 → 核对数量 → 填写收货信息 → 提交订单。如需进一步确认配置、库存或交货时间，Nova 将主动联系客户。"
                },
                {
                    title: "售价与库存状态",
                    content: "价格、库存数量和供货时间以订单记录的信息为准。定制设备、项目型产品或需要单独报价的产品将在执行前再次确认。"
                },
                {
                    title: "收货检查",
                    content: "客户收货时应立即核对产品名称、型号、数量、包装状况及附件。如有差异，请保留照片并联系 Nova 获取支持。"
                },
                {
                    title: "修改或取消订单",
                    content: "如需修改或取消订单，请尽早通过热线或电子邮件提出。能否处理取决于订单状态和产品特性，尤其是定制产品或已交付承运方的订单。"
                }
            ]
        },
        en: {
            title: "Purchase Policy",
            summary: "Terms governing information, confirmation, and order processing for equipment, components, and technical solutions purchased from Nova.",
            sections: [
                {
                    title: "Purchase Requirements",
                    content: "Customers must provide complete contact and delivery information. For products requiring configuration advice or marked as contact-only, Nova will discuss the requirements before confirming the order."
                },
                {
                    title: "Ordering Process",
                    content: "Select products → Add to cart → Check quantities → Enter delivery information → Submit the order. Nova will contact the customer if configuration, stock, or delivery timing requires further confirmation."
                },
                {
                    title: "Pricing and Availability",
                    content: "Prices, available quantities, and fulfilment times are recorded according to the order information. Configured equipment, project goods, and products requiring a separate quotation will be confirmed before fulfilment."
                },
                {
                    title: "Inspection on Delivery",
                    content: "Customers should check the product name, model, quantity, packaging condition, and accessories upon delivery. If anything differs, please keep photographic evidence and contact Nova for assistance."
                },
                {
                    title: "Order Changes or Cancellation",
                    content: "Requests to change or cancel an order should be submitted as early as possible by hotline or email. Availability depends on the order status and product characteristics, especially for custom goods or orders already handed to the carrier."
                }
            ]
        }
    },
    warranty: {
        zh: {
            title: "保修与退换货",
            summary: "关于 Nova 所供应产品的保修受理、技术检测及退换货处理说明。",
            sections: [
                {
                    title: "保修范围",
                    content: "保修期限和范围以具体产品、制造商规定或订单约定为准。部分工业设备需先进行技术检测，才能确定处理方案。"
                },
                {
                    title: "受理条件",
                    content: "产品需提供相应订单信息或凭证，标签、序列号及产品状态不得有异常改动。建议客户说明故障情况并提供照片或视频，以便技术检查。"
                },
                {
                    title: "保修申请流程",
                    content: "联系 Nova → 提供订单编号和产品状态 → 接收寄送或交接设备的指引 → Nova 检测并通知处理方案。"
                },
                {
                    title: "产品退换",
                    content: "对于错发、少发、运输损坏或需要核实的技术问题，Nova 将受理客户申请。经检查后，双方确认更换、维修或退回方案。"
                },
                {
                    title: "不属于免费保修的情况",
                    content: "因安装或使用不当、擅自维修、机械冲击、电源不匹配、异常环境或自然损耗造成的损坏，可能不属于免费保修范围。"
                }
            ]
        },
        en: {
            title: "Warranty & Returns",
            summary: "Information on warranty intake, technical inspection, and return handling for products supplied by Nova.",
            sections: [
                {
                    title: "Warranty Coverage",
                    content: "The warranty period and scope follow the information for each product, the manufacturer's terms, or the agreement stated on the order. Some industrial equipment must be technically inspected before a resolution can be determined."
                },
                {
                    title: "Acceptance Requirements",
                    content: "The product must have appropriate order information or supporting documents, and its labels, serial number, and condition must not show abnormal alteration. Customers should describe the fault and provide photos or video to support inspection."
                },
                {
                    title: "Warranty Request Process",
                    content: "Contact Nova → Provide the order number and product condition → Receive instructions for sending or handing over the equipment → Nova inspects the product and advises the proposed resolution."
                },
                {
                    title: "Product Returns",
                    content: "Nova accepts requests for incorrectly supplied, missing, transit-damaged, or technically questionable products. Replacement, repair, or return arrangements are agreed after inspection."
                },
                {
                    title: "Cases Outside Warranty Coverage",
                    content: "Damage caused by incorrect installation or use, unauthorized repair, mechanical impact, unsuitable power supply, abnormal environments, or normal wear may not qualify for free warranty service."
                }
            ]
        }
    },
    shipping: {
        zh: {
            title: "配送与交付",
            summary: "Nova 的配送原则、运输费用以及设备收货检查说明。",
            sections: [
                {
                    title: "配送范围",
                    content: "Nova 支持配送至越南境内符合条件的地址。运输方式将根据产品尺寸、重量、技术特性及收货地点选择。"
                },
                {
                    title: "运输费用与时间",
                    content: "预计运费和交货时间将在订单处理中显示或确认。大型设备、项目货物、定制产品或非常规地区可能需要单独报价。"
                },
                {
                    title: "交接与检查",
                    content: "签收前，请收货人核对包裹数量、型号、产品数量及外观状态。如发现包装凹陷、破损、受潮或信息不符，请拍照并联系 Nova。"
                },
                {
                    title: "安装与运行",
                    content: "运输服务不默认包含现场安装、接线或操作指导。相关技术服务将依据订单、报价单或另行约定执行。"
                },
                {
                    title: "预计时间之外的延误",
                    content: "交货时间可能因交通、天气、运输安排、定制生产或不可控事件而变化。如有变动，Nova 将在获得信息后及时更新。"
                }
            ]
        },
        en: {
            title: "Shipping & Delivery",
            summary: "Principles for delivery, shipping charges, and equipment inspection when receiving goods from Nova.",
            sections: [
                {
                    title: "Delivery Coverage",
                    content: "Nova supports delivery to eligible addresses throughout Vietnam. The shipping method is selected according to the product's dimensions, weight, technical characteristics, and delivery location."
                },
                {
                    title: "Shipping Charges and Time",
                    content: "Estimated shipping charges and delivery times are displayed or confirmed while the order is processed. Bulky equipment, project goods, custom orders, or unusual destinations may require a separate shipping quotation."
                },
                {
                    title: "Handover and Inspection",
                    content: "The recipient should check the number of packages, models, quantities, and external condition before accepting delivery. If a package is dented, torn, wet, or incorrectly labelled, please take photos and contact Nova."
                },
                {
                    title: "Installation and Operation",
                    content: "Shipping does not automatically include installation, wiring, or on-site operating guidance. Technical services are provided according to the order, quotation, or a separate agreement."
                },
                {
                    title: "Unexpected Delivery Delays",
                    content: "Delivery times may change because of traffic, weather, carrier schedules, configured goods, or events beyond reasonable control. Nova will provide updates when new information becomes available."
                }
            ]
        }
    },
    privacy: {
        zh: {
            title: "隐私政策",
            summary: "Nova 在咨询、购买和技术支持过程中收集、使用及保护相关信息的方式。",
            sections: [
                {
                    title: "收集的信息",
                    content: "客户使用网站时，Nova 可能接收其主动提供的姓名、电话号码、电子邮箱、收货地址、订单信息及支持沟通内容。"
                },
                {
                    title: "使用目的",
                    content: "相关信息用于确认和配送订单、提供技术支持与保修、回复请求、管理账户以及改进产品或服务质量。"
                },
                {
                    title: "信息共享",
                    content: "仅在完成交易或满足合法要求所必需时，Nova 才会向负责部门、承运方、技术合作伙伴或有权机关共享必要信息。"
                },
                {
                    title: "存储与保护",
                    content: "信息将在订单处理、客户支持及相关管理义务所需的合理期限内保存。Nova 采取合理措施限制未经授权的访问。"
                },
                {
                    title: "客户权利",
                    content: "客户可以联系 Nova，申请核查、更新个人信息或了解其处理方式。Nova 将在核实申请人身份并考虑相关保存义务后进行处理。"
                }
            ]
        },
        en: {
            title: "Privacy Policy",
            summary: "How Nova collects, uses, and protects information generated during consultation, purchasing, and technical support.",
            sections: [
                {
                    title: "Information We Collect",
                    content: "Nova may receive names, phone numbers, email addresses, delivery addresses, order details, and support communications that customers voluntarily provide while using the website."
                },
                {
                    title: "Purposes of Use",
                    content: "Information is used to confirm and deliver orders, provide technical support and warranty service, respond to requests, manage accounts, and improve product or service quality."
                },
                {
                    title: "Information Sharing",
                    content: "Nova shares only the information necessary with responsible teams, carriers, technical partners, or competent authorities when required to complete transactions or meet lawful requests."
                },
                {
                    title: "Storage and Protection",
                    content: "Information is retained for a period appropriate to order processing, customer support, and related management obligations. Nova applies reasonable measures to restrict unauthorized access."
                },
                {
                    title: "Customer Rights",
                    content: "Customers may contact Nova to request access to or correction of their personal information, or to discuss how it is processed. Requests are reviewed after verifying the requester and considering applicable retention obligations."
                }
            ]
        }
    }
};

module.exports = { POLICY_TRANSLATIONS };
