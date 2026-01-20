<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->json('embedding')->nullable()->after('profile_picture');
            $table->text('embedding_text')->nullable()->after('embedding'); // Store the text used for embedding
            $table->timestamp('embedding_generated_at')->nullable()->after('embedding_text');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn(['embedding', 'embedding_text', 'embedding_generated_at']);
        });
    }
};