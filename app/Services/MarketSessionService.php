<?php

namespace App\Services;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Resolves which market session(s) a UTC timestamp falls in.
 *
 * Each session is defined by its own local trading hours in its own IANA
 * timezone rather than by fixed UTC offsets, so the London and New York
 * boundaries follow BST/EDT automatically instead of drifting by an hour for
 * roughly half the year.
 *
 * Sessions are time-of-day only — no weekday filter — because this app also
 * covers crypto, which trades through the weekend. A Saturday timestamp still
 * resolves to whichever session window contains it.
 *
 * The chart overlay needs the same boundaries in the browser, so these windows
 * are mirrored in `resources/js/Components/Market/MarketChart/marketSessions.js`.
 * Change one and you must change the other; `MarketSessionServiceTest` and
 * `marketSessions.test.js` both pin the resulting UTC boundaries in winter and
 * summer to catch a drift between them.
 */
class MarketSessionService
{
    public const OVERLAP_KEY = 'londonNewYork';

    public const OVERLAP_LABEL = 'London / New York';

    public const OFF_SESSION_LABEL = 'Off-session';

    /**
     * Window bounds are minutes from local midnight in the session's own zone.
     * 540 = 09:00, 1080 = 18:00, 480 = 08:00, 1020 = 17:00.
     */
    private const DEFINITIONS = [
        'asian' => ['label' => 'Asian', 'timezone' => 'Asia/Tokyo', 'start' => 540, 'end' => 1080],
        'london' => ['label' => 'London', 'timezone' => 'Europe/London', 'start' => 480, 'end' => 1020],
        'newYork' => ['label' => 'New York', 'timezone' => 'America/New_York', 'start' => 480, 'end' => 1020],
    ];

    /**
     * Most specific first. The reported label is the first match, so an
     * overlapping timestamp reads as New York rather than London.
     */
    private const LABEL_PRIORITY = ['newYork', 'london', 'asian'];

    /** @var array<string, DateTimeZone> */
    private array $timezones = [];

    /**
     * @return array<string, array{label: string, timezone: string, start: int, end: int}>
     */
    public function definitions(): array
    {
        return self::DEFINITIONS;
    }

    /**
     * Session keys open at this instant, in definition order.
     *
     * @return list<string>
     */
    public function activeKeys(int $timestamp): array
    {
        $moment = new DateTimeImmutable('@'.$timestamp);
        $active = [];

        foreach (self::DEFINITIONS as $key => $definition) {
            $local = $moment->setTimezone($this->timezone($definition['timezone']));
            $minutes = ((int) $local->format('G') * 60) + (int) $local->format('i');

            if ($this->withinWindow($minutes, $definition['start'], $definition['end'])) {
                $active[] = $key;
            }
        }

        return $active;
    }

    /**
     * Single bucket label for grouping a trade. London and New York open
     * together for several hours a day and that overlap is the highest-volume
     * window there is, so it gets its own bucket instead of being absorbed
     * into New York and hidden.
     */
    public function label(int $timestamp): string
    {
        $active = $this->activeKeys($timestamp);

        if (in_array('london', $active, true) && in_array('newYork', $active, true)) {
            return self::OVERLAP_LABEL;
        }

        foreach (self::LABEL_PRIORITY as $key) {
            if (in_array($key, $active, true)) {
                return self::DEFINITIONS[$key]['label'];
            }
        }

        return self::OFF_SESSION_LABEL;
    }

    private function withinWindow(int $minutes, int $start, int $end): bool
    {
        // A window that wraps past local midnight (start > end) is open on both
        // sides of the boundary. None of the built-ins wrap today, but Sydney
        // would if it is ever added.
        return $start <= $end
            ? ($minutes >= $start && $minutes < $end)
            : ($minutes >= $start || $minutes < $end);
    }

    private function timezone(string $name): DateTimeZone
    {
        return $this->timezones[$name] ??= new DateTimeZone($name);
    }
}
