import database
from datetime import datetime
import statistics

async def analyze_runs(duration_filter=None, model_filter=None):
    # Retrieve all metrics from db
    all_metrics = await database.get_all_metrics()
    
    if not all_metrics:
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

    # Group metrics by session_id
    session_metrics = {}
    for m in all_metrics:
        sid = m["session_id"]
        if sid not in session_metrics:
            session_metrics[sid] = []
        session_metrics[sid].append(m)

    total_calls = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    latencies = []

    model_stats = {}
    detailed_runs = []

    # Get sessions to know timestamps and status
    sessions = {s["id"]: s for s in await database.get_sessions()}

    for sid, metrics in session_metrics.items():
        session = sessions.get(sid, {})
        timestamp = session.get("created_at", datetime.utcnow().isoformat())
        status = session.get("status", "unknown")
        
        run_total_tokens = 0
        run_prompt_tokens = 0
        run_completion_tokens = 0
        run_calls = len(metrics)
        models_in_run = set()
        run_duration = 0.0

        for m in metrics:
            model = m.get("model_name") or "unknown"
            models_in_run.add(model)

            p_tok = m.get("prompt_tokens") or 0
            c_tok = m.get("completion_tokens") or 0
            duration = m.get("run_duration") or 0.0

            if model not in model_stats:
                model_stats[model] = {
                    "calls": 0, "prompt_tokens": 0, "completion_tokens": 0,
                    "runs_count": 0, "latencies": [],
                    "_seen_sids": set()
                }
            
            model_stats[model]["calls"] += 1
            model_stats[model]["prompt_tokens"] += p_tok
            model_stats[model]["completion_tokens"] += c_tok
            model_stats[model]["latencies"].append(duration)
            
            # Since a model could be used multiple times in a session, let's keep runs_count as distinct sessions
            if sid not in model_stats[model]["_seen_sids"]:
                model_stats[model]["_seen_sids"].add(sid)
                model_stats[model]["runs_count"] += 1

            total_calls += 1
            total_prompt_tokens += p_tok
            total_completion_tokens += c_tok
            latencies.append(duration)

            run_prompt_tokens += p_tok
            run_completion_tokens += c_tok
            run_total_tokens += (p_tok + c_tok)
            run_duration += duration
            
        detailed_runs.append({
            "id": sid,
            "timestamp": timestamp,
            "duration": run_duration,
            "models": list(models_in_run),
            "calls": run_calls,
            "tokens": run_total_tokens,
            "prompt_tokens": run_prompt_tokens,
            "completion_tokens": run_completion_tokens,
            "reasoning_tokens": 0,
            "latency": run_duration / run_calls if run_calls else None,
            "status": status
        })

    avg_lat = statistics.mean(latencies) if latencies else None

    global_stats = {
        "total_runs": len(session_metrics),
        "total_calls": total_calls,
        "total_tokens": total_prompt_tokens + total_completion_tokens,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "reasoning_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "cache_hit_ratio": 0,
        "total_cost": 0.0,
        "avg_latency": avg_lat
    }

    model_stats_arr = []
    for m_name, m_data in model_stats.items():
        model_stats_arr.append({
            "name": m_name,
            "runs_count": m_data["runs_count"],
            "calls": m_data["calls"],
            "total_tokens": m_data["prompt_tokens"] + m_data["completion_tokens"],
            "prompt_tokens": m_data["prompt_tokens"],
            "completion_tokens": m_data["completion_tokens"],
            "reasoning_tokens": 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
            "cache_hit_ratio": 0,
            "cost": 0.0,
            "avg_latency": statistics.mean(m_data["latencies"]) if m_data["latencies"] else None
        })

    detailed_runs.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "global_stats": global_stats,
        "model_stats": model_stats_arr,
        "detailed_runs": detailed_runs
    }
