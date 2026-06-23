import os
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
import statistics

def parse_duration(duration_str):
    if not duration_str:
        return None
    unit = duration_str[-1].lower()
    try:
        val = float(duration_str[:-1])
    except ValueError:
        raise ValueError(f"Invalid duration value: {duration_str}")
    
    if unit == 'h': return timedelta(hours=val)
    elif unit == 'd': return timedelta(days=val)
    elif unit == 'm': return timedelta(minutes=val)
    else: raise ValueError(f"Unknown duration unit '{unit}'")

def get_run_timestamp(run_dir):
    events_dir = run_dir / "events"
    if events_dir.is_dir():
        event_files = sorted(events_dir.glob("event-*.json"))
        if event_files:
            try:
                with open(event_files[0], 'r', encoding='utf-8') as f:
                    event_data = json.load(f)
                    ts_str = event_data.get("timestamp")
                    if ts_str:
                        dt = datetime.fromisoformat(ts_str)
                        if dt.tzinfo is None:
                            dt = dt.astimezone()
                        return dt
            except Exception:
                pass
    
    base_state_path = run_dir / "base_state.json"
    if base_state_path.exists():
        mtime = os.path.getmtime(base_state_path)
        return datetime.fromtimestamp(mtime).astimezone()
    return None

def get_run_duration(run_dir):
    events_dir = run_dir / "events"
    start_time = None
    end_time = None
    if events_dir.is_dir():
        event_files = sorted(events_dir.glob("event-*.json"))
        if len(event_files) >= 2:
            try:
                with open(event_files[0], 'r', encoding='utf-8') as f:
                    event_data = json.load(f)
                    ts_str = event_data.get("timestamp")
                    if ts_str:
                        dt = datetime.fromisoformat(ts_str)
                        if dt.tzinfo is None:
                            dt = dt.astimezone()
                        start_time = dt
                
                with open(event_files[-1], 'r', encoding='utf-8') as f:
                    event_data = json.load(f)
                    ts_str = event_data.get("timestamp")
                    if ts_str:
                        dt = datetime.fromisoformat(ts_str)
                        if dt.tzinfo is None:
                            dt = dt.astimezone()
                        end_time = dt
            except Exception:
                pass
                
    if start_time and end_time and end_time > start_time:
        return (end_time - start_time).total_seconds()
    return None

def analyze_runs(agent_runs_path_str, duration_filter=None, model_filter=None):
    agent_runs_path = Path(agent_runs_path_str)
    runs_data = []
    
    if not agent_runs_path.is_dir():
        # Directory doesn't exist yet (e.g. no runs have been executed)
        # Return empty metrics instead of an error
        return {
            "global_stats": {
                "total_runs": 0, "total_calls": 0, "total_tokens": 0,
                "prompt_tokens": 0, "completion_tokens": 0, "reasoning_tokens": 0, "cache_read_tokens": 0,
                "cache_write_tokens": 0, "cache_hit_ratio": 0, "total_cost": 0.0,
                "avg_latency": None
            },
            "model_stats": [],
            "detailed_runs": []
        }

    now = datetime.now(timezone.utc)
    cutoff_time = now - duration_filter if duration_filter else None

    for run_dir in agent_runs_path.iterdir():
        if not run_dir.is_dir() or run_dir.name in ("conversations", "__pycache__"):
            continue
            
        base_state_path = run_dir / "base_state.json"
        if not base_state_path.exists():
            continue
            
        run_time = get_run_timestamp(run_dir)
        if not run_time:
            continue
            
        if cutoff_time and run_time < cutoff_time:
            continue
            
        try:
            with open(base_state_path, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except Exception:
            continue
            
        stats = state.get("stats", {})
        usage_to_metrics = stats.get("usage_to_metrics", {})
        if not usage_to_metrics:
            continue
            
        models_in_run = set()
        for usage_id, metrics in usage_to_metrics.items():
            model = metrics.get("model_name")
            if model:
                models_in_run.add(model)
                
        if model_filter:
            match = False
            for model in models_in_run:
                if model_filter.lower() in model.lower():
                    match = True
                    break
            if not match:
                continue
                
        run_duration = get_run_duration(run_dir)
        
        runs_data.append({
            "id": state.get("id", run_dir.name),
            "dir_name": run_dir.name,
            "timestamp": run_time,
            "duration": run_duration,
            "usage_to_metrics": usage_to_metrics,
            "models": list(models_in_run),
            "status": state.get("execution_status", "unknown")
        })
        
    runs_data.sort(key=lambda x: x["timestamp"])
    return _build_response(runs_data)

def _build_response(runs):
    total_calls = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_reasoning_tokens = 0
    total_cache_read_tokens = 0
    total_cache_write_tokens = 0
    total_cost = 0.0
    latencies = []
    
    model_stats = {}
    detailed_runs = []

    for run in runs:
        run_total_tokens = 0
        run_prompt_tokens = 0
        run_completion_tokens = 0
        run_reasoning_tokens = 0
        run_latencies = []
        run_calls = 0
        
        for usage_id, metrics in run["usage_to_metrics"].items():
            model = metrics.get("model_name")
            if not model:
                continue
                
            if model not in model_stats:
                model_stats[model] = {
                    "calls": 0, "prompt_tokens": 0, "completion_tokens": 0,
                    "reasoning_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0,
                    "cost": 0.0, "latencies": [], "runs_count": 0
                }
                
            token_usage = metrics.get("accumulated_token_usage", {})
            p_tok = token_usage.get("prompt_tokens", 0)
            c_tok = token_usage.get("completion_tokens", 0)
            r_tok = token_usage.get("reasoning_tokens", 0)
            cr_tok = token_usage.get("cache_read_tokens", 0)
            cw_tok = token_usage.get("cache_write_tokens", 0)
            
            token_usages_list = metrics.get("token_usages", [])
            if p_tok == 0 and token_usages_list:
                for tu in token_usages_list:
                    p_tok += tu.get("prompt_tokens", 0)
                    c_tok += tu.get("completion_tokens", 0)
                    r_tok += tu.get("reasoning_tokens", 0)
                    cr_tok += tu.get("cache_read_tokens", 0)
                    cw_tok += tu.get("cache_write_tokens", 0)
            
            cost = metrics.get("accumulated_cost", 0.0)
            if cost == 0.0:
                cost = sum(metrics.get("costs", []))
                
            resp_latencies = metrics.get("response_latencies", [])
            run_lats = [rl.get("latency", 0.0) for rl in resp_latencies if rl.get("latency") is not None]
            
            calls = len(resp_latencies) or len(token_usages_list) or 1
            
            model_stats[model]["calls"] += calls
            model_stats[model]["prompt_tokens"] += p_tok
            model_stats[model]["completion_tokens"] += c_tok
            model_stats[model]["reasoning_tokens"] += r_tok
            model_stats[model]["cache_read_tokens"] += cr_tok
            model_stats[model]["cache_write_tokens"] += cw_tok
            model_stats[model]["cost"] += cost
            model_stats[model]["latencies"].extend(run_lats)
            model_stats[model]["runs_count"] += 1
            
            total_calls += calls
            total_prompt_tokens += p_tok
            total_completion_tokens += c_tok
            total_reasoning_tokens += r_tok
            total_cache_read_tokens += cr_tok
            total_cache_write_tokens += cw_tok
            total_cost += cost
            latencies.extend(run_lats)
            
            run_total_tokens += (p_tok + c_tok)
            run_prompt_tokens += p_tok
            run_completion_tokens += c_tok
            run_reasoning_tokens += r_tok
            run_latencies.extend(run_lats)
            run_calls += calls
            
        detailed_runs.append({
            "id": run["dir_name"],
            "timestamp": run["timestamp"].astimezone().isoformat(),
            "duration": run["duration"],
            "models": run["models"],
            "calls": run_calls,
            "tokens": run_total_tokens,
            "prompt_tokens": run_prompt_tokens,
            "completion_tokens": run_completion_tokens,
            "reasoning_tokens": run_reasoning_tokens,
            "latency": statistics.mean(run_latencies) if run_latencies else None,
            "status": run["status"]
        })

    avg_lat = statistics.mean(latencies) if latencies else None
    
    # Calculate Cache Hit Ratio
    cache_hit_ratio = 0
    if (total_prompt_tokens + total_cache_read_tokens) > 0:
        cache_hit_ratio = (total_cache_read_tokens / (total_prompt_tokens + total_cache_read_tokens)) * 100

    global_stats = {
        "total_runs": len(runs),
        "total_calls": total_calls,
        "total_tokens": total_prompt_tokens + total_completion_tokens,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "reasoning_tokens": total_reasoning_tokens,
        "cache_read_tokens": total_cache_read_tokens,
        "cache_write_tokens": total_cache_write_tokens,
        "cache_hit_ratio": cache_hit_ratio,
        "total_cost": total_cost,
        "avg_latency": avg_lat
    }
    
    # Format model stats to array
    model_stats_arr = []
    for m_name, m_data in model_stats.items():
        m_cache_hit = 0
        if (m_data['prompt_tokens'] + m_data['cache_read_tokens']) > 0:
            m_cache_hit = (m_data['cache_read_tokens'] / (m_data['prompt_tokens'] + m_data['cache_read_tokens'])) * 100
            
        model_stats_arr.append({
            "name": m_name,
            "runs_count": m_data["runs_count"],
            "calls": m_data["calls"],
            "total_tokens": m_data["prompt_tokens"] + m_data["completion_tokens"],
            "prompt_tokens": m_data["prompt_tokens"],
            "completion_tokens": m_data["completion_tokens"],
            "reasoning_tokens": m_data["reasoning_tokens"],
            "cache_read_tokens": m_data["cache_read_tokens"],
            "cache_write_tokens": m_data["cache_write_tokens"],
            "cache_hit_ratio": m_cache_hit,
            "cost": m_data["cost"],
            "avg_latency": statistics.mean(m_data["latencies"]) if m_data["latencies"] else None
        })
        
    return {
        "global_stats": global_stats,
        "model_stats": model_stats_arr,
        "detailed_runs": list(reversed(detailed_runs)) # Newest first
    }
