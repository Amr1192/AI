<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SkillSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DB::table('user_skills')->insert([
            [
                'user_id' => 1,
                'title' => 'HTML',
                'years_of_experience' => 1,
                'proficiency_level' => 'beginner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => 1,
                'title' => 'css',
                'years_of_experience' => 1,
                'proficiency_level' => 'beginner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => 2,
                'title' => 'JavaScript',
                'years_of_experience' => 1,
                'proficiency_level' => 'beginner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => 2,
                'title' => 'php',
                'years_of_experience' => 1,
                'proficiency_level' => 'beginner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => 3,
                'title' => 'laravel',
                'years_of_experience' => 1,
                'proficiency_level' => 'beginner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}
