def merge_and_score_accounts(suspicious_accounts, node_tx_count, node_timestamps):
    merged = {}

    for entry in suspicious_accounts:
        acc_id = entry["account_id"]

        if acc_id not in merged:
            merged[acc_id] = {
                "account_id": acc_id,
                "suspicion_score": 0,
                "detected_patterns": set(),
                "ring_id": entry["ring_id"]
            }

        # Add score
        merged[acc_id]["suspicion_score"] += entry["suspicion_score"]

        # Add patterns
        for p in entry["detected_patterns"]:
            merged[acc_id]["detected_patterns"].add(p)

    final_list = []

    for acc_id, acc in merged.items():

        score = acc["suspicion_score"]

        # 🔐 FALSE POSITIVE CONTROL

        tx_count = node_tx_count.get(acc_id, 0)
        timestamps = node_timestamps.get(acc_id, [])

        if len(timestamps) > 1:
            time_span_days = (
                (max(timestamps) - min(timestamps)).total_seconds()
                / (3600 * 24)
            )
        else:
            time_span_days = 0

        # Legitimate high-volume accounts (merchant/payroll behavior)
        if tx_count > 50 and time_span_days > 60:
            score *= 0.6  # reduce suspicion score

        acc["suspicion_score"] = min(round(score, 2), 100)
        acc["detected_patterns"] = list(acc["detected_patterns"])

        # Only keep meaningful risk
        if acc["suspicion_score"] >= 50:
            final_list.append(acc)

    final_list.sort(key=lambda x: x["suspicion_score"], reverse=True)

    return final_list
