<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddVideoFramesToInterviewsTable extends Migration
{
    public function up()
    {
        Schema::table('interviews', function (Blueprint $table) {
            $table->json('video_frames')->nullable();
            $table->integer('video_frame_count')->default(0);
            $table->json('video_analysis')->nullable();
                 $table->json('conversation_history')->nullable();
            $table->json('stats')->nullable();
            $table->json('comprehensive_analysis')->nullable();
$table->timestamp('analyzed_at')->nullable();

        });
    }

    public function down()
    {
        Schema::table('interviews', function (Blueprint $table) {
            $table->dropColumn(['video_frames', 'video_frame_count', 'video_analysis']);
            $table->dropColumn(['conversation_history', 'stats']);
        });
    }
}
