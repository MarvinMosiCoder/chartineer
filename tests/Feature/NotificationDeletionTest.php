<?php

namespace Tests\Feature;

use App\Models\AdmModels\AdmNotifications;
use App\Models\AdmModels\AdmPrivileges;
use App\Models\AdmUser;
use App\Models\Announcement;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Runs against the real schema (like BacktestTradeNotificationTest) rather than
 * the sqlite-backed feature tests, which skip in this environment.
 */
class NotificationDeletionTest extends TestCase
{
    use DatabaseTransactions;

    private function makeUser(): AdmUser
    {
        return AdmUser::query()->create([
            'name' => 'Notification Delete Test',
            'email' => uniqid('notif-delete-', true).'@example.test',
            'password' => bcrypt('password'),
            'status' => 'ACTIVE',
            'id_adm_privileges' => AdmPrivileges::query()->where('is_superadmin', false)->value('id'),
        ]);
    }

    private function makeNotification(AdmUser $user, string $content = 'ETHUSDT closed'): AdmNotifications
    {
        return AdmNotifications::query()->create([
            'adm_user_id' => $user->id,
            'type' => 'stop loss',
            'content' => $content,
            'is_read' => false,
        ]);
    }

    private function makeAnnouncement(string $message = '<p>Welcome!</p><p><br></p><p>Stay on top of the markets.</p>'): Announcement
    {
        return Announcement::query()->create([
            'title' => 'New Updates',
            'message' => $message,
            'status' => 'ACTIVE',
        ]);
    }

    public function test_a_user_deletes_one_owned_notification(): void
    {
        $user = $this->makeUser();
        $notification = $this->makeNotification($user);
        $keep = $this->makeNotification($user, 'BTCUSDT closed');

        $this->actingAs($user)->deleteJson("/notifications/notification/{$notification->id}")->assertOk();

        $this->assertDatabaseMissing('adm_notifications', ['id' => $notification->id]);
        $this->assertDatabaseHas('adm_notifications', ['id' => $keep->id]);
    }

    public function test_a_user_cannot_delete_someone_elses_notification(): void
    {
        $owner = $this->makeUser();
        $intruder = $this->makeUser();
        $notification = $this->makeNotification($owner);

        $this->actingAs($intruder)->deleteJson("/notifications/notification/{$notification->id}")->assertNotFound();

        $this->assertDatabaseHas('adm_notifications', ['id' => $notification->id]);
    }

    public function test_deleting_an_announcement_only_hides_it_for_that_user(): void
    {
        $user = $this->makeUser();
        $other = $this->makeUser();
        $announcement = $this->makeAnnouncement();

        $this->actingAs($user)->deleteJson("/notifications/announcement/{$announcement->id}")->assertOk();

        // The announcement row itself must survive — it is published for everyone.
        $this->assertDatabaseHas('announcements', ['id' => $announcement->id, 'status' => 'ACTIVE']);
        $this->assertNotNull(DB::table('announcement_user')
            ->where('announcement_id', $announcement->id)->where('adm_user_id', $user->id)->value('hidden_at'));

        $this->actingAs($user)->get('/notifications/view-all-notifications')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where(
                'notifications',
                fn ($notifications) => collect($notifications)->doesntContain('key', 'announcement:'.$announcement->id)
            ));

        $this->actingAs($other)->get('/notifications/view-all-notifications')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where(
                'notifications',
                fn ($notifications) => collect($notifications)->contains('key', 'announcement:'.$announcement->id)
            ));
    }

    public function test_delete_all_clears_the_callers_history_only(): void
    {
        $user = $this->makeUser();
        $other = $this->makeUser();
        $mine = $this->makeNotification($user);
        $theirs = $this->makeNotification($other);
        $announcement = $this->makeAnnouncement();

        $this->actingAs($user)->deleteJson('/notifications/all')->assertOk();

        $this->assertDatabaseMissing('adm_notifications', ['id' => $mine->id]);
        $this->assertDatabaseHas('adm_notifications', ['id' => $theirs->id]);
        $this->assertNotNull(DB::table('announcement_user')
            ->where('announcement_id', $announcement->id)->where('adm_user_id', $user->id)->value('hidden_at'));
        $this->assertDatabaseMissing('announcement_user', ['announcement_id' => $announcement->id, 'adm_user_id' => $other->id]);
    }

    public function test_the_history_page_sends_plain_text_rows_and_sanitized_announcement_markup(): void
    {
        $user = $this->makeUser();
        $announcement = $this->makeAnnouncement('<p>Welcome!</p><script>alert(1)</script><p onclick="alert(2)">Stay tuned</p>');

        $this->actingAs($user)->get('/notifications/view-all-notifications')
            ->assertOk()
            ->assertInertia(function ($page) use ($announcement) {
                $row = collect($page->toArray()['props']['notifications'])
                    ->firstWhere('key', 'announcement:'.$announcement->id);

                // The list row is plain text: no markup leaks into the feed.
                $this->assertStringNotContainsString('<', $row['content']);
                $this->assertStringContainsString('New Updates — Welcome!', $row['content']);
                // The modal gets markup, minus anything executable.
                $this->assertStringContainsString('<p>Welcome!</p>', $row['content_html']);
                $this->assertStringNotContainsString('script', $row['content_html']);
                $this->assertStringNotContainsString('onclick', $row['content_html']);
            });
    }

    public function test_read_all_does_not_unhide_a_deleted_announcement(): void
    {
        $user = $this->makeUser();
        $announcement = $this->makeAnnouncement();

        $this->actingAs($user)->deleteJson("/notifications/announcement/{$announcement->id}")->assertOk();
        $this->actingAs($user)->postJson('/notifications/read-all')->assertOk();

        $this->assertNotNull(DB::table('announcement_user')
            ->where('announcement_id', $announcement->id)->where('adm_user_id', $user->id)->value('hidden_at'));
    }
}
