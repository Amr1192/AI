<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            AdminSeeder::class,
            CompanySeeder::class,
            JobSeeder::class,
            UserSeeder::class,
            SkillSeeder::class,
        ]);
    }
}
