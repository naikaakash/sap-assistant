const csv = require('csvtojson');

const csvContent = `po_number,item_number,material_id,material_description,plant,storage_location,order_qty,uom,net_price,price_unit,item_value,delivery_date,item_category,account_assignment_category,deletion_flag,delivery_completed_flag,invoice_receipt_flag,goods_receipt_flag,confirmation_control_key
4500001000,00010,M100001,Microprocessor Core v1,PL01,SL01,100,PC,15.00,1,1500.00,2026-06-25,STANDARD,,N,N,Y,Y,`;

csv()
  .fromString(csvContent)
  .then((jsonObj) => {
    console.log('Parsed row:', jsonObj[0]);
    console.log('confirmation_control_key type:', typeof jsonObj[0].confirmation_control_key);
    console.log('confirmation_control_key value:', JSON.stringify(jsonObj[0].confirmation_control_key));
  });
