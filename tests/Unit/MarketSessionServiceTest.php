<?php

namespace Tests\Unit;

use App\Services\MarketSessionService;
use PHPUnit\Framework\TestCase;

class MarketSessionServiceTest extends TestCase
{
    /**
     * 2024-01-15 is a Monday in GMT/EST, so London runs 08:00-17:00 UTC,
     * New York 13:00-22:00 UTC, and Tokyo 00:00-09:00 UTC.
     */
    public function test_it_labels_winter_sessions_in_utc(): void
    {
        $service = new MarketSessionService();

        $this->assertSame('Asian', $service->label($this->winterAt(2, 0)));
        $this->assertSame('London', $service->label($this->winterAt(10, 0)));
        $this->assertSame('London / New York', $service->label($this->winterAt(14, 0)));
        $this->assertSame('New York', $service->label($this->winterAt(18, 0)));
        $this->assertSame('Off-session', $service->label($this->winterAt(23, 0)));
    }

    /**
     * 2024-07-15 is BST/EDT, shifting London to 07:00-16:00 UTC and New York
     * to 12:00-21:00 UTC. Tokyo does not observe DST and does not move.
     */
    public function test_it_labels_summer_sessions_in_utc(): void
    {
        $service = new MarketSessionService();

        $this->assertSame('London', $service->label($this->summerAt(7, 30)));
        $this->assertSame('London / New York', $service->label($this->summerAt(12, 30)));
        $this->assertSame('New York', $service->label($this->summerAt(16, 30)));
        $this->assertSame('Off-session', $service->label($this->summerAt(21, 30)));
    }

    /**
     * The regression the fixed-UTC-hour implementation could not catch: the
     * same clock time falls in a different session depending on the date.
     */
    public function test_boundaries_follow_daylight_saving(): void
    {
        $service = new MarketSessionService();

        $this->assertSame('Asian', $service->label($this->winterAt(7, 30)));
        $this->assertSame('London', $service->label($this->summerAt(7, 30)));

        $this->assertSame('London', $service->label($this->winterAt(12, 30)));
        $this->assertSame('London / New York', $service->label($this->summerAt(12, 30)));
    }

    public function test_it_reports_every_open_session_not_just_the_label(): void
    {
        $service = new MarketSessionService();

        $this->assertSame(['asian', 'london'], $service->activeKeys($this->summerAt(8, 0)));
        $this->assertSame(['london', 'newYork'], $service->activeKeys($this->winterAt(14, 0)));
        $this->assertSame([], $service->activeKeys($this->winterAt(23, 0)));
    }

    public function test_sessions_are_not_closed_at_weekends(): void
    {
        // 2024-01-20 is a Saturday. Crypto trades through it, so the window
        // still resolves rather than falling back to off-session.
        $saturday = $this->winterAt(14, 0) + (5 * 86400);

        $this->assertSame('London / New York', (new MarketSessionService())->label($saturday));
    }

    /** 2024-01-15 00:00:00 UTC */
    private function winterAt(int $hour, int $minute): int
    {
        return 1705276800 + ($hour * 3600) + ($minute * 60);
    }

    /** 2024-07-15 00:00:00 UTC */
    private function summerAt(int $hour, int $minute): int
    {
        return 1721001600 + ($hour * 3600) + ($minute * 60);
    }
}
