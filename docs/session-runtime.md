# Session runtime — user requested

Instructor and slideshow show HH:MM:SS using the same persisted lectures.started_at / ended_at fields, propagated through initial reads, snapshots and Realtime. End freezes elapsed time; restart starts a new run. New local demo sessions also store timestamps. Missing historic timestamps are shown as unavailable, never guessed from page load. No per-second DB requests, schema changes or permission changes. Presentation clock remains visible when controls hide. Existing local data must not be reset.
