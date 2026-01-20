<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
  public function up()
{
    Schema::table('interview_answers', function (Blueprint $table) {
        $table->string('model_used')->nullable();
        $table->string('analysis_source')->default('ai'); // ai | fallback
        $table->string('verification_token')->nullable();
    });
}


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('interview_answers');
}
};
