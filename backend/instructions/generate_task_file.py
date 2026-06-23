import json
import os
import sys
from pathlib import Path

def format_column_schema(col) -> str:
    col_name = col['name']
    col_type = col['type']
    if col_type == 'array':
        if 'element_type' in col:
            return f"{col_name} (array<{col['element_type']}>)"
        elif 'contains' in col:
            inner_formatted = format_column_schema(col['contains'])
            if ' (' in inner_formatted:
                inner_type = inner_formatted.split(' (', 1)[1].rstrip(')')
            else:
                inner_type = inner_formatted
            return f"{col_name} (array<{inner_type}>)"
        elif 'fields' in col:
            fields_ddl = []
            for f_str in [format_column_schema(f) for f in col['fields']]:
                if ' (' in f_str:
                    f_name, f_type = f_str.split(' (', 1)
                    f_type = f_type.rstrip(')')
                    fields_ddl.append(f"{f_name}:{f_type}")
                else:
                    fields_ddl.append(f_str)
            return f"{col_name} (array<struct<{', '.join(fields_ddl)}>>)"
        else:
            return f"{col_name} (array<string>)"
    elif col_type == 'struct':
        fields_ddl = []
        for f_str in [format_column_schema(f) for f in col.get('fields', [])]:
            if ' (' in f_str:
                f_name, f_type = f_str.split(' (', 1)
                f_type = f_type.rstrip(')')
                fields_ddl.append(f"{f_name}:{f_type}")
            else:
                fields_ddl.append(f_str)
        return f"{col_name} (struct<{', '.join(fields_ddl)}>)"
    else:
        return f"{col_name} ({col_type})"

def dynamically_update_setup_ipynb(meta, entity_name, workspace_path_str=None):
    # Determine the relative landing path from trigger settings
    rel_path = entity_name
    job = meta.get("job", {})
    trigger = job.get("trigger", {})
    if trigger.get("type") == "file_arrival":
        path_tmpl = trigger.get("settings", {}).get("path_template", "")
        prefix = "/Volumes/{catalog}/{pipeline_schema}/{volume}/"
        if path_tmpl.startswith(prefix):
            rel_path = path_tmpl[len(prefix):].strip("/")
            rel_path = rel_path.replace("{entity_name}", entity_name)
            
    # Format the display name (e.g. "distributor" -> "Distributor", "consumer_order" -> "Consumer Order")
    display_name = " ".join(word.capitalize() for word in entity_name.split("_"))
    
    # Resolve target project dynamically from environment or last run state
    if workspace_path_str:
        workspace = Path(workspace_path_str)
    else:
        workspace = Path(__file__).resolve().parent.parent
    last_project_file = workspace / ".last_project"
    default_project = "demo"
    if last_project_file.exists():
        try:
            default_project = last_project_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    import os
    target_project_name = os.environ.get("TARGET_PROJECT", default_project)
    
    setup_path = workspace / target_project_name / "src" / "bootstrap" / "setup.ipynb"
    if not setup_path.exists():
        print(f"Warning: setup.ipynb not found at {setup_path}")
        return
        
    with open(setup_path, 'r', encoding='utf-8') as f:
        notebook = json.load(f)
        
    modified = False
    for cell in notebook.get("cells", []):
        if cell.get("cell_type") == "code":
            source = cell.get("source", [])
            start_idx = -1
            end_idx = -1
            for i, line in enumerate(source):
                if "input_file_paths = {" in line:
                    start_idx = i
                elif start_idx != -1 and "}" in line:
                    end_idx = i
                    break
                    
            if start_idx != -1 and end_idx != -1:
                # Parse existing keys
                existing_entries = {}
                for line in source[start_idx+1:end_idx]:
                    cleaned = line.strip().rstrip(",").strip()
                    if cleaned:
                        parts = cleaned.split(":")
                        if len(parts) == 2:
                            k = parts[0].strip().strip('"').strip("'")
                            v = parts[1].strip().strip('"').strip("'")
                            existing_entries[k] = v
                            
                if display_name not in existing_entries:
                    # Insert new entry before the closing brace line
                    prev_idx = end_idx - 1
                    if prev_idx > start_idx:
                        prev_line = source[prev_idx]
                        if not prev_line.strip().endswith(",") and not prev_line.strip().endswith("{"):
                            if prev_line.endswith("\n"):
                                source[prev_idx] = prev_line[:-1] + ",\n"
                            else:
                                source[prev_idx] = prev_line + ",\n"
                                
                    new_line = f"    \"{display_name}\": \"{rel_path}\"\n"
                    source.insert(end_idx, new_line)
                    modified = True
                    break
                    
    if modified:
        with open(setup_path, 'w', encoding='utf-8') as f:
            json.dump(notebook, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print(f"Dynamically added '{display_name}': '{rel_path}' to setup.ipynb")

def generate_task_file(metadata_path: Path, output_path: Path, workspace_path_str: str = None):
    with open(metadata_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)
        
    entity = meta['entity']
    entity_name = entity['name']
    job = meta['job']
    source = meta['source']
    rules = meta['processing_rules']
    cdc = rules['cdc']
    layers = rules['layers']
    runtime_config = meta['runtime_config']
    
    pks = entity.get('primary_keys', [])
    for col_info in source['schema']:
        if col_info.get('primary_key') and col_info['name'] not in pks:
            pks.append(col_info['name'])
    relationships = meta.get('relationships', [])
    
    lines = []
    base_path_val = workspace_path_str if workspace_path_str else "the designated workspace folder"
    lines.append(f"IMPORTANT: Strictly in this BASE_PATH={base_path_val}")
    lines.append("The terminal is Windows PowerShell 5.1. **CRITICAL**: Do NOT use `&&` or `||` to chain commands in terminal tool calls (PowerShell doesn't support them). Always run commands sequentially or use `;` as a separator.")
    lines.append("")
    lines.append("Starting point:")
    lines.append("  - A metadata JSON file (e.g., metadata_consumer.json) exists in `instructions/metadata/` with a dynamic structure.")
    lines.append("  - The `demo/` project exists and will be populated based on the metadata configuration.")
    lines.append("")
    lines.append(f"Entity: {entity_name} ({entity.get('description', 'No description')})")
    lines.append("")
    lines.append("Folder structure to be created under demo/:")
    lines.append("  demo/")
    lines.append("    databricks.yml")
    lines.append("    resources/")
    lines.append("      jobs/")
    lines.append(f"      pipelines/{entity_name}/")
    lines.append("    src/")
    lines.append(f"      {entity_name}/")
    lines.append(f"        {entity_name}_bronze/")
    lines.append("          transformations/")
    lines.append(f"        {entity_name}_silver/")
    lines.append("          transformations/")
    lines.append("")
    lines.append("General Instructions:")
    lines.append("  - This task is driven by the dynamic metadata file. All generated files should be derived from its contents.")
    lines.append("  - Use `task_tracker` to plan the work.")
    lines.append(f"  - The entity name to use is: '{entity_name}'.")
    lines.append("")
    lines.append("Coding Standards:")
    lines.append("  - Use standard indentation (2 spaces for YAML, 4 for Python) and proper line breaks.")
    lines.append("  - Use Delta Live Tables (DLT) syntax (`import dlt`, `@dlt.table`).")
    lines.append("  - Use `spark.conf.get()` to retrieve pipeline configuration values.")
    lines.append("")
    
    # Turn 1
    lines.append("**Turn 1: YAML Configuration (Bundle, Jobs, Pipelines)**")
    lines.append("")
    lines.append("1.  **databricks.yml**:")
    lines.append("    - Create/update `demo/databricks.yml` to support inclusion patterns (use glob patterns `resources/**/*.yml` to search subdirectories recursively).")
    req_keys = [k['name'] for k in runtime_config['required_keys']]
    lines.append(f"    - Define bundle variables: {', '.join(req_keys)}, plus `bronze_target_schema` and `silver_target_schema`.")
    lines.append("      - WARNING: You MUST edit/create `demo/databricks.yml` and declare all of the requested variables and inclusion glob patterns.")
    lines.append("Make sure finally the databricks.yml structure after edit is proper")
    
    lines.append("2.  **Job YAML**:")
    job_name = job['name_template'].format(entity_name=entity_name)
    lines.append(f"    - Create `demo/resources/jobs/{entity_name}_job.yml` named: `{job_name}`.")
    
    trigger_type = job['trigger']['type']
    if trigger_type == 'file_arrival':
        path_tmpl = job['trigger']['settings'].get('path_template', '/Volumes/{catalog}/{pipeline_schema}/{volume}/{entity_name}/')
        path_filled = path_tmpl.replace('{entity_name}', entity_name)
        lines.append(f"    - Configure job trigger with `pause_status: UNPAUSED` and `file_arrival` with url: `{path_filled}`.")
    elif trigger_type == 'schedule':
        cron = job['trigger']['settings']['cron_expression']
        tz = job['trigger']['settings'].get('time_zone', 'UTC')
        lines.append(f"    - Configure job trigger with `pause_status: UNPAUSED` and `schedule` with cron expression `{cron}` at timezone `{tz}`.")
    else:
        lines.append("    - Configure job trigger as manual (no schedule or file arrival trigger).")
        
    flow = [item['pipeline'] for item in job['pipeline_flow']]
    lines.append(f"    - Set up tasks: {', '.join(flow)} with dependencies matching the flow in metadata.")
    lines.append(f"      - **CRITICAL**: When referencing pipeline IDs (e.g. `pipeline_id`), reference the flat resource key directly. Do NOT include the folder path or entity namespace inside the key (e.g., use `${{resources.pipelines.{entity_name}_bronze_pipeline.id}}` instead of `${{resources.pipelines.{entity_name}.{entity_name}_bronze_pipeline.id}}`).")
    lines.append("")
    
    lines.append("3.  **Pipeline YAMLs**:")
    for item in job['pipeline_flow']:
        p_name = item['pipeline']
        lines.append(f"    - Create serverless DLT pipeline configuration `demo/resources/pipelines/{entity_name}/{entity_name}_{p_name}_pipeline.yml`.")
        lines.append(f"      - Target should be: `{entity_name}_{p_name}`.")
        lines.append(f"      - Catalog should be: `${{var.catalog}}`.")
        if p_name == "bronze":
            lines.append(f"      - Libraries should list these file paths under the `- file:` parameter (since they are raw python scripts, NOT notebooks, relative to the pipeline config folder):")
            lines.append(f"        - `../../../src/{entity_name}/{entity_name}_bronze/transformations/landing.py`")
            lines.append(f"        - `../../../src/{entity_name}/{entity_name}_bronze/transformations/bronze.py`")
        else:
            lines.append(f"      - Libraries should list this file path under the `- file:` parameter (since it is a raw python script, NOT a notebook, relative to the pipeline config folder):")
            lines.append(f"        - `../../../src/{entity_name}/{entity_name}_{p_name}/transformations/{p_name}.py`")
        if p_name == "silver":
            lines.append(f"      - Pass configuration variables: catalog, pipeline_schema, volume, and target_schema (which should be set to `{entity_name}_silver`). Do NOT pass `bronze_schema`.")
        else:
            lines.append(f"      - Pass configuration variables: catalog, pipeline_schema, volume, and target_schema (which should be set to `{entity_name}_bronze`).")
    lines.append("")
    
    lines.append("4.  **Bootstrap / Orchestration Setup (Bootstrap Part)**:")
    lines.append("    - Update/Create `instructions/metadata/project_metadata.json`:")
    lines.append("      - If the file is missing, initialize it with a basic skeleton containing `schema_version`, `project_name`, `global_config` and `bootstrap` object (having `job_name`, `setup_notebook_path`, `entities` list, and `dependency_graph` containing the `setup` notebook task).")
    lines.append(f"      - Add the entity details (name, folder path, and job resource key `{entity_name}_workflow`) to the `bootstrap.entities` array.")
    lines.append(f"      - Add a corresponding orchestration task `run_{entity_name}_job` of type `run_job_task` referencing `{entity_name}_workflow` job to the `bootstrap.dependency_graph` under the correct dependency sequence.")
    lines.append("    - `demo/src/bootstrap/setup.ipynb`:")
    lines.append("      - If this file is missing, create it using the base JSON notebook template defined in knowledge.")
    lines.append("      - (Note: The task generator has already dynamically registered this entity, but if the notebook is recreated from scratch, ensure the `input_file_paths` dictionary includes this entity's mapping.)")
    lines.append("    - Update/Create `demo/resources/jobs/bootstrap_job.yml`:")
    lines.append("      - If this file is missing, create it using the base YAML template defined in knowledge.")
    lines.append(f"      - Add a task to run the entity's workflow job (`run_{entity_name}_job`) using `run_job_task` type and specify its execution dependencies (it should depend sequentially on the last entity task in the bootstrap workflow to run all entity workflows serially, rather than in parallel).")
    lines.append("")
    
    # Turn 2
    lines.append("**Turn 2: Transformation Code Implementation**")
    lines.append("")
    lines.append("1.  **landing.py** (in the bronze pipeline transformations folder):")
    lines.append("    - **CRITICAL**: Construct the landing path dynamically by reading configuration values `catalog`, `pipeline_schema`, and `volume` from Spark conf (via `spark.conf.get()`). Do NOT hardcode or use fallback literals containing bundle-style variables like `\"/Volumes/${var.catalog}...\"` in Python code.")
    lines.append("    - Read stream in format `cloudFiles` from landing path.")
    lines.append(f"    - Configure Auto Loader option `cloudFiles.format` as `{source['format']}`.")
    if source.get('reader_options'):
        opts = [f"{k}={v}" for k, v in source['reader_options'].items()]
        lines.append(f"    - Configure reader options: {', '.join(opts)}.")
    
    cols_desc = [format_column_schema(col) for col in source['schema']]
    lines.append(f"    - Define explicit PySpark schema: {', '.join(cols_desc)}.")
    
    if 'landing' in layers:
        gen_cols = layers['landing'].get('generated_columns', [])
        for gc in gen_cols:
            lines.append(f"    - Generate column `{gc['name']}` ({gc['type']}) using expression `{gc['expression']}`.")
            
    if cdc['enabled']:
        lines.append(f"    - Apply CDC changes targeting streaming table `{entity_name}_cdc_stream`:")
        lines.append(f"      - CDC Type: `{cdc['type']}`")
        lines.append(f"      - Keys: {', '.join(cdc['keys'])}")
        lines.append(f"      - Sequence by: `{cdc['sequence_by']}`")
        if cdc.get('operation_column'):
            lines.append(f"      - Operation column: `{cdc['operation_column']}` (deletes when value is '{cdc.get('delete_value', 'delete')}', specified using a Column expression like `col(\"{cdc['operation_column']}\") == \"{cdc.get('delete_value', 'delete')}\"`)")
        lines.append(f"      - **CRITICAL**: Do NOT decorate the function executing `dlt.apply_changes` with `@dlt.table` and return its output. Instead, create the streaming table first via `dlt.create_streaming_table(\"{entity_name}_cdc_stream\")`, read the raw stream inside a separate `@dlt.view` function, and execute `dlt.apply_changes` at the module level (outside any decorated function).")
    lines.append("")
    
    lines.append("2.  **bronze.py** (in the bronze pipeline transformations folder):")
    if 'bronze' in layers:
        b_layer = layers['bronze']
        src_tbl = b_layer['source_table'].format(entity_name=entity_name)
        tgt_view = b_layer['target_view'].format(entity_name=entity_name)
        lines.append(f"    - Create materialized view `{tgt_view}` reading from `{src_tbl}` using `dlt.read(\"{src_tbl}\")` (do NOT use legacy `spark.read.table(\"LIVE.{src_tbl}\")`).")
        if b_layer.get('filters'):
            lines.append(f"    - Apply filters: {', '.join(b_layer['filters'])}.")
        if b_layer.get('drop_columns'):
            lines.append(f"    - Drop columns: {', '.join(b_layer['drop_columns'])}.")
    lines.append("")
    
    lines.append("3.  **silver.py** (in the silver pipeline transformations folder):")
    if 'silver' in layers:
        s_layer = layers['silver']
        src_vw = s_layer['source_view'].format(entity_name=entity_name)
        tgt_vw = s_layer['target_view'].format(entity_name=entity_name)
        lines.append(f"    - Create materialized view `{tgt_vw}` reading from the external bronze table `{src_vw}` using `spark.read.table(f\"{{catalog}}.{{bronze_schema}}.{src_vw}\")` where `catalog` and `target_schema` are retrieved from Spark conf (retrieved via `SparkSession.getActiveSession().conf.get(...)`), and `bronze_schema` is resolved dynamically in Python by replacing `_silver` with `_bronze` in `target_schema`.")
        lines.append(f"      - **CRITICAL**: Retrieve the catalog name from Spark configuration using the flat key `\"catalog\"` (via `spark.conf.get(\"catalog\", \"main\")`). Do NOT check keys like `\"target.catalog\"` or `\"bundle.catalog\"` as they are not defined in the configuration block.")
        lines.append("      - **CRITICAL**: Ensure SparkSession is imported correctly: `from pyspark.sql import SparkSession`. Do NOT import it from `pyspark.sql.functions`.")
        
        exps = [f"{e['name']} ({e['expression']} -> action: {e['action']})" for e in s_layer.get('expectations', [])]
        if exps:
            lines.append(f"    - Apply DLT data quality expectations: {', '.join(exps)}.")
            
        trans = s_layer.get('transformations', [])
        if trans:
            lines.append("    - Apply column transformations:")
            for t in trans:
                rule_name = t['rule']
                cols_str = ', '.join(t['columns'])
                if rule_name == 'custom_sql':
                    expr = t.get('params', {}).get('expression', '')
                    lines.append(f"      - Rule `custom_sql` on columns: {cols_str} using Spark SQL expression: `{expr}`.")
                elif rule_name == 'from_unixtime':
                    is_ms = t.get('params', {}).get('is_milliseconds', False)
                    unit_str = "milliseconds" if is_ms else "seconds"
                    lines.append(f"      - Rule `from_unixtime` on columns: {cols_str} (convert from UNIX epoch in {unit_str}).")
                elif rule_name == 'to_utc_timestamp':
                    tz = t.get('params', {}).get('timezone', 'UTC')
                    lines.append(f"      - Rule `to_utc_timestamp` on columns: {cols_str} (shift timestamp to timezone `{tz}`).")
                else:
                    p_desc = f" (params: {t['params']})" if t.get('params') else ""
                    lines.append(f"      - Rule `{rule_name}` on columns: {cols_str}{p_desc}.")
                
        # Primary Key Constraints
        if pks:
            lines.append(f"    - Declare informational primary key constraints on `{tgt_vw}` (Primary Key: {', '.join(pks)}):")
            lines.append("      - **CRITICAL**: Do NOT execute raw `spark.sql(\"ALTER TABLE ...\")` statements at the module level in your transformation Python files. This runs during import/compilation time and causes DLT validation to fail.")
            lines.append("      - Instead, specify the informational primary key constraint inside the `@dlt.table(schema=\"...\")` decorator parameter using a DDL schema string containing columns and types with `NOT NULL PRIMARY KEY` specified on key column(s).")
            
        # Relationships & Referential Integrity
        if relationships:
            lines.append("    - Implement referential integrity check expectations for relationships:")
            for rel in relationships:
                local_cols = ", ".join(rel['local_keys'])
                ref_ent = rel['referenced_entity']
                ref_cols = ", ".join(rel['referenced_keys'])
                lines.append(f"      - Validate relationship `{rel['name']}`: local keys `{local_cols}` must reference `{ref_ent}` keys `{ref_cols}`.")
                lines.append(f"        - Implementation Steps to prevent schema pollution and column name collisions:")
                lines.append(f"          1. Load the parent table `{ref_ent}_mv` using `spark.read.table(f\"{{catalog}}.{ref_ent}_bronze.{ref_ent}_mv\")`.")
                lines.append(f"          2. Select only key column(s) from the parent table, renaming them to avoid name collisions (e.g. rename `{ref_cols}` to `parent_{ref_cols}`).")
                lines.append(f"          3. Perform a left join of the child table with the parent key subset on the matching keys (e.g. `df.join(parent_df, df[\"{local_cols}\"] == parent_df[\"parent_{ref_cols}\"], \"left\")`).")
                lines.append(f"          4. Apply the DLT expectation `@dlt.expect_or_drop(\"valid_{rel['name']}\", \"parent_{ref_cols} IS NOT NULL\")`. Note that this validation column must remain in the returned DataFrame so that DLT can evaluate the expectation against the schema.")
    lines.append("")
    
    # Turn 3
    lines.append("**Turn 3: Final Verification & Logical Correctness Audit**")
    lines.append("")
    lines.append("1. Confirm that all target pipeline YAML configs and source Python files exist under `demo/` folder structure.")
    lines.append("2. Verify that the files match all configuration values in the metadata file.")
    lines.append("3. Perform a thorough audit of the code and configuration for logical errors. Specifically verify:")
    lines.append("   - All referenced bundle variables (like `${var.volume}`) are defined under the `variables` section in `demo/databricks.yml`.")
    lines.append("   - The inclusion pattern in `demo/databricks.yml` is recursive (e.g. `resources/pipelines/**/*.yml`).")
    lines.append("   - `silver.py` replacement mapping logic works dynamically. For instance, if `target_schema` is set to `distributor_silver`, replacing `_silver` with `_bronze` correctly resolves to `distributor_bronze` (which matches the bronze pipeline's target schema).")
    lines.append("   - There are **no** module-level `spark.sql` statements executing DDL commands.")
    lines.append("4. Proactively correct any logical errors, syntax issues, or target-schema discrepancies found during verification.")
    
    # Dynamically update setup.ipynb
    dynamically_update_setup_ipynb(meta, entity_name, workspace_path_str)
    
    target_project = os.environ.get("TARGET_PROJECT", "demo")
    final_text = "\n".join(lines).replace("demo/", f"{target_project}/")
    
    with open(output_path, 'w', encoding='utf-8') as f_out:
        f_out.write(final_text)
        
    print(f"Successfully generated dynamic task file at: {output_path.name}")

if __name__ == "__main__":
    base_dir = Path(__file__).parent
    meta_path = base_dir / "metadata" / "metadata_consumer.json"
    out_path = base_dir / "tasks" / "task3.txt"
    if len(sys.argv) > 1:
        meta_path = Path(sys.argv[1])
    if len(sys.argv) > 2:
        out_path = Path(sys.argv[2])
    ws = sys.argv[3] if len(sys.argv) > 3 else None
    generate_task_file(meta_path, out_path, ws)
