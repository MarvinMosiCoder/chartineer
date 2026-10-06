<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('memecoin_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('adm_user_id')->constrained('adm_users')->cascadeOnDelete();
            $table->string('chain', 32);
            $table->string('address', 64);
            $table->char('address_hash', 64);
            $table->char('fingerprint', 64);
            $table->string('symbol')->nullable();
            $table->string('name')->nullable();
            $table->string('verdict', 16);
            $table->unsignedTinyInteger('score');
            $table->dateTime('checked_at', 6);
            $table->json('report');
            $table->timestamps();
            $table->index(['adm_user_id', 'chain', 'address']);
            $table->index(['adm_user_id', 'checked_at']);
            $table->unique(['adm_user_id', 'fingerprint']);
            $table->index(['adm_user_id', 'address_hash']);
        });
        Schema::create('memecoin_wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('adm_user_id')->constrained('adm_users')->cascadeOnDelete();
            $table->string('address', 64);
            // Solana addresses are case-sensitive even under MySQL's default collation.
            $table->char('address_hash', 64);
            $table->string('list', 16);
            $table->string('label', 100)->nullable();
            $table->text('note')->nullable();
            $table->string('last_signature', 128)->nullable();
            $table->dateTime('last_checked_at')->nullable();
            $table->timestamps();
            $table->unique(['adm_user_id', 'address_hash', 'list']);
        });
        Schema::create('memecoin_trades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('adm_user_id')->constrained('adm_users')->cascadeOnDelete();
            $table->foreignId('report_id')->nullable()->constrained('memecoin_reports')->nullOnDelete();
            $table->string('chain', 32);
            $table->string('address', 64);
            $table->string('symbol', 64)->nullable();
            $table->double('entry_price');
            $table->double('amount_usd')->nullable();
            $table->text('entry_reason');
            $table->dateTime('entered_at');
            $table->double('exit_price')->nullable();
            $table->text('exit_reason')->nullable();
            $table->dateTime('exited_at')->nullable();
            $table->timestamps();
            $table->index(['adm_user_id', 'entered_at']);
        });
        Schema::create('memecoin_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('adm_user_id')->constrained('adm_users')->cascadeOnDelete();
            $table->string('wallet_address', 64);
            $table->string('wallet_list', 16);
            $table->string('wallet_label', 100)->nullable();
            $table->string('mint', 64);
            $table->double('amount');
            $table->string('signature', 128);
            $table->char('event_hash', 64);
            $table->dateTime('block_time')->nullable();
            $table->boolean('seen')->default(false);
            $table->timestamps();
            $table->unique(['adm_user_id', 'event_hash']);
            $table->index(['adm_user_id', 'seen']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memecoin_alerts');
        Schema::dropIfExists('memecoin_trades');
        Schema::dropIfExists('memecoin_wallets');
        Schema::dropIfExists('memecoin_reports');
    }
};
