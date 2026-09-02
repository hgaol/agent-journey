# Keep stable Journeys with immutable revisions

A logical conversation has one stable Journey identity while every materially changed source state creates an immutable Journey Revision. The newest revision is the normal view, but previous revisions remain available and exports or durable references pin a specific revision. This adds revision management and storage complexity, but prevents rescans, resumed conversations, truncation, or source rewrites from silently changing previously reviewed evidence.
