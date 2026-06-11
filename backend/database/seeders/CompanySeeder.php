<?php

namespace Database\Seeders;

use App\Models\Company;
use Illuminate\Database\Seeder;

class CompanySeeder extends Seeder
{
    public function run(): void
    {
        $companies = [
            [
                'name' => 'Tech Solutions Inc',
                'location' => 'New York, USA',
                'description' => 'A leading technology solutions provider specializing in enterprise software and cloud platforms.',
                'website' => 'https://techsolutions.example.com',
            ],
            [
                'name' => 'Digital Innovations Ltd',
                'location' => 'London, UK',
                'description' => 'Digital transformation and consulting company helping businesses innovate with modern tooling.',
                'website' => 'https://digitalinnovations.example.com',
            ],
            [
                'name' => 'Future Systems Corp',
                'location' => 'San Francisco, USA',
                'description' => 'AI and machine learning focused technology company building intelligent products.',
                'website' => 'https://futuresystems.example.com',
            ],
            [
                'name' => 'WebTech Solutions',
                'location' => 'Berlin, Germany',
                'description' => 'Web development and design agency creating cutting-edge websites and applications.',
                'website' => 'https://webtech.example.com',
            ],
            [
                'name' => 'Nile Software House',
                'location' => 'Cairo, Egypt',
                'description' => 'Regional software studio delivering fintech, e-commerce, and SaaS products across MENA.',
                'website' => 'https://nilesoftware.example.com',
            ],
            [
                'name' => 'CloudBridge Analytics',
                'location' => 'Dubai, UAE',
                'description' => 'Data analytics and business intelligence consultancy for enterprise clients.',
                'website' => 'https://cloudbridge.example.com',
            ],
        ];

        foreach ($companies as $company) {
            Company::updateOrCreate(
                ['name' => $company['name']],
                $company
            );
        }
    }
}
