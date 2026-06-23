import json
from pathlib import Path
import jsonschema
from jsonschema import validate

def verify_schemas():
    base_dir = Path(__file__).parent
    schema_path = base_dir / "metadata" / "metadata_schema.json"
    
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)
        
    targets = [
        "metadata_consumer.json",
        "metadata_distributor.json",
        "metadata_orders.json",
        "metadata_consumer_order.json",
        "metadata_consumer_order_items.json",
        "metadata_test_advanced.json"
    ]
    
    all_passed = True
    print("Starting JSON Schema validation against metadata_schema.json:")
    print("=" * 60)
    
    for target_name in targets:
        target_path = base_dir / "metadata" / target_name
        if not target_path.exists():
            print(f"[FAIL] {target_name}: File not found!")
            all_passed = False
            continue
            
        with open(target_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as jde:
                print(f"[FAIL] {target_name}: Invalid JSON format - {jde}")
                all_passed = False
                continue
                
        try:
            validate(instance=data, schema=schema)
            print(f"[PASS] {target_name}: Validated successfully!")
        except jsonschema.exceptions.ValidationError as ve:
            print(f"[FAIL] {target_name}: Schema validation failed!")
            print(f"   Reason: {ve.message}")
            print(f"   Path: {' -> '.join(str(p) for p in ve.path)}")
            all_passed = False
            
    print("=" * 60)
    if all_passed:
        print("Success: All files validated successfully against the schema!")
    else:
        print("Error: Some files failed validation. Please review the errors above.")
        exit(1)

if __name__ == "__main__":
    verify_schemas()
