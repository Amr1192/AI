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
    Schema::table('interviews', function (Blueprint $table) {
        $table->json('overall')->nullable();
    });
}

public function down()
{
    Schema::table('interviews', function (Blueprint $table) {
        $table->dropColumn('overall');
    });
}

};
