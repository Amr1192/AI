<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('interviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('question');                 // asked question
            $table->string('media_path')->nullable();   // storage path to uploaded recording
            $table->longText('transcript')->nullable(); // full transcript
            $table->longText('feedback_json')->nullable(); // JSON metrics from GPT
            $table->string('status')->default('created');  // created|uploaded|processing|complete
            $table->timestamps();
        });
    }
    public function down(): void {
        Schema::dropIfExists('interviews');
    }
};

