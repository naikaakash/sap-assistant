import csv
import os
import re

DATA_ROOT = 'procurement_data_sample'

def read_csv(filename):
    path = os.path.join(DATA_ROOT, filename)
    if not os.path.exists(path):
        print(f"ERROR: File not found: {path}")
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return list(csv.DictReader(f))

def get_overdue_summary(exceptions, items, schedules):
    # Match overdueExceptions
    overdue_ex = [e for e in exceptions if e['exception_type'] == 'PO_OVERDUE']
    
    # Simple stats
    active_overdue = [e for e in overdue_ex if e['status'] != 'RESOLVED']
    return {
        'totalOverduePoLines': len(active_overdue),
        'totalOverdueValue': sum(float(e.get('financial_impact_estimate', 0) or 0) for e in active_overdue)
    }

def fetch_joined_part_availability(ctb_snapshots, stock, mp, materials):
    stock_map = {}
    for s in stock:
        stock_map[f"{s['material_id']}_{s['plant']}"] = float(s.get('unrestricted_stock', 0) or 0)
        
    mp_map = {}
    for m in mp:
        mp_map[f"{m['material_id']}_{m['plant']}"] = m
        
    mat_map = {}
    for m in materials:
        mat_map[m['material_id']] = m.get('material_name', '')
        
    joined = []
    for ctb in ctb_snapshots:
        key = f"{ctb['material_id']}_{ctb['plant']}"
        unrestricted = stock_map.get(key, 0.0)
        m_plant = mp_map.get(key, {})
        safety_stock = float(m_plant.get('safety_stock', 0) or 0)
        
        shortage = float(ctb.get('shortage_qty', 0) or 0)
        safety_violation = unrestricted < safety_stock
        
        joined.append({
            'material_id': ctb['material_id'],
            'material_name': mat_map.get(ctb['material_id'], 'Unknown'),
            'plant': ctb['plant'],
            'safety_stock': safety_stock,
            'unrestricted_stock': unrestricted,
            'safety_stock_violation': safety_violation,
            'shortage_qty': shortage
        })
    return joined

def fetch_joined_ack_worklist(acks, items, headers, suppliers, plants, exceptions):
    items_map = {f"{i['po_number']}_{i['item_number']}": i for i in items}
    headers_map = {h['po_number']: h for h in headers}
    suppliers_map = {s['supplier_id']: s for s in suppliers}
    exceptions_map = {f"{e['po_number']}_{e['item_number']}": e for e in exceptions}
    
    joined = []
    for ack in acks:
        item_key = f"{ack['po_number']}_{ack['item_number']}"
        po_item = items_map.get(item_key, {})
        po_header = headers_map.get(ack['po_number'], {})
        supplier = suppliers_map.get(po_header.get('supplier_id', ''), {})
        ex_info = exceptions_map.get(item_key, {})
        
        ordered_qty = float(po_item.get('order_qty', 0) or 0)
        net_price = float(po_item.get('net_price', 0) or 0)
        open_value = ordered_qty * net_price
        
        joined.append({
            'po_number': ack['po_number'],
            'item_number': ack['item_number'],
            'acknowledgement_status': ack.get('acknowledgement_status', 'MISSING'),
            'buyer_followup_count': int(ack.get('buyer_followup_count', 0) or 0),
            'plant': po_item.get('plant', ''),
            'supplier_id': po_header.get('supplier_id', ''),
            'supplier_name': supplier.get('supplier_name', po_header.get('supplier_id', '')),
            'open_value': open_value
        })
    return joined

def test():
    # Load all files
    exceptions = read_csv('exception_worklist.csv')
    items = read_csv('purchase_order_items.csv')
    headers = read_csv('purchase_order_headers.csv')
    suppliers = read_csv('suppliers.csv')
    plants = read_csv('plants.csv')
    schedules = read_csv('po_schedule_lines.csv')
    acks = read_csv('supplier_acknowledgements.csv')
    ctb_snapshots = read_csv('ctb_snapshots.csv')
    stock = read_csv('inventory_stock.csv')
    mp = read_csv('material_plant.csv')
    materials = read_csv('materials.csv')
    
    print("Files loaded successfully.")
    
    # 1. Overdue Summary
    overdue_sum = get_overdue_summary(exceptions, items, schedules)
    print("Overdue Summary:", overdue_sum)
    
    # 2. Part availability
    parts = fetch_joined_part_availability(ctb_snapshots, stock, mp, materials)
    print(f"Parts availability count: {len(parts)}, violations count: {len([p for p in parts if p['safety_stock_violation']])}")
    
    # 3. Acks
    joined_acks = fetch_joined_ack_worklist(acks, items, headers, suppliers, plants, exceptions)
    print(f"Joined Acks count: {len(joined_acks)}, missing count: {len([a for a in joined_acks if a['acknowledgement_status'] == 'MISSING'])}")
    
    # 4. priorityInbox mapping
    suppliers_map = {s['supplier_id']: s['supplier_name'] for s in suppliers}
    
    critical_ex = [e for e in exceptions if e['severity'] == 'CRITICAL' and e['status'] != 'RESOLVED']
    print(f"Critical unresolved exceptions: {len(critical_ex)}")
    for e in critical_ex[:2]:
        desc = f"Critical exception event: {e['exception_type'].replace('_', ' ')} detected on PO {e.get('po_number', 'N/A')}"
        print(f"  - {desc}, supplier: {suppliers_map.get(e['supplier_id'], 'N/A')}")
        
    late_ex = [e for e in exceptions if e['exception_type'] == 'PO_OVERDUE' and e['status'] != 'RESOLVED' and e['severity'] != 'CRITICAL']
    print(f"Late exceptions (PO_OVERDUE): {len(late_ex)}")
    for e in late_ex[:2]:
        desc = f"Purchase order {e['po_number']} is significantly past due (overdue by {e.get('days_past_due', '0')} days)"
        print(f"  - {desc}, supplier: {suppliers_map.get(e['supplier_id'], 'N/A')}")
        
    critical_parts = [p for p in parts if p['safety_stock_violation']]
    print(f"Critical parts shortages: {len(critical_parts)}")
    for p in critical_parts[:2]:
        deficit = round(p['safety_stock'] - p['unrestricted_stock'])
        desc = f"Stock breach: Part {p['material_name'] or p['material_id']} is below safety stock at Plant {p['plant']} (deficit: {deficit} units)"
        print(f"  - {desc}")
        
    missing_acks = [a for a in joined_acks if a['acknowledgement_status'] == 'MISSING']
    print(f"Missing acks: {len(missing_acks)}")
    for a in missing_acks[:2]:
        desc = f"Acknowledge missing: Supplier {a['supplier_name'] or a['supplier_id']} has not acknowledged PO {a['po_number']} line {a['item_number']}"
        print(f"  - {desc}")

if __name__ == '__main__':
    test()
