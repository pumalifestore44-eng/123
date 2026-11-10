import{readFileSync,writeFileSync}from'node:fs';const path="smax-chat-manager - Copy (2)/supabase/gomship_extension_queue.sql";let s=readFileSync(path,'utf8');
const edits=[
["if p_gomship_order_id is null or p_gomship_order_id<=0 or\n   p_spx_waybill !~ '^SPXVN[A-Z0-9]+$' or length(p_spx_waybill)>80 then",
 "if p_gomship_order_id is null or p_gomship_order_id<=0 or\n   p_spx_waybill is null or p_spx_waybill !~ '^SPXVN[A-Z0-9]+$' or length(p_spx_waybill)>80 then"],
["(nullif(trim(jt_waybill_id),'') is not null or shipment_claim_token is not null))",
 "(nullif(trim(jt_waybill_id),'') is not null or shipment_claim_token is not null or\n       (public.shipment_is_closed(status::text) and lower(trim(status::text)) not in ('6','đã hủy','đã huỷ'))))"]
];
for(const[a,b]of edits){if(!s.includes(a))throw Error('Missing '+a);s=s.replace(a,b);}
writeFileSync(path,s);console.log('Added stricter group validation and nullable waybill check');