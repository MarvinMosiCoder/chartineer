<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_feedback_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_feedback_id')->constrained('user_feedback')->cascadeOnDelete();
            // Path on the PRIVATE `local` disk — never web-reachable, never sent to
            // the client. Screenshots routinely show balances and open positions,
            // so these are served only through the authorized download route.
            $table->string('path', 500);
            $table->string('name', 255);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->timestamps();

            $table->index('user_feedback_id', 'user_feedback_attachments_feedback_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_feedback_attachments');
    }
};
