<?php

return [
    'enabled' => env('CROSS_MARGIN_MONITOR_ENABLED', false),
    'poll_seconds' => max(1, (int) env('CROSS_MARGIN_MONITOR_POLL_SECONDS', 5)),
];
