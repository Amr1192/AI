<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Job;
use Illuminate\Database\Seeder;

class JobSeeder extends Seeder
{
    public function run(): void
    {
        $companyIds = Company::pluck('id', 'name');

        $jobs = [
            [
                'company_name' => 'Tech Solutions Inc',
                'title' => 'Senior Laravel Developer',
                'description' => 'We are looking for an experienced Laravel developer to join our backend team. You will be working on building scalable web applications, RESTful APIs, and microservices.',
                'requirements' => 'Required: 5+ years PHP experience, 3+ years Laravel, MySQL, Redis, Git. Preferred: Vue.js, Docker, AWS.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 90000,
                'salary_to' => 130000,
                'deadline' => now()->addDays(30),
                'is_active' => true,
            ],
            [
                'company_name' => 'Tech Solutions Inc',
                'title' => 'Full Stack Developer (Laravel + Vue.js)',
                'description' => 'Join our product team as a full stack developer working with Laravel backend and Vue.js frontend.',
                'requirements' => 'Required: 3+ years experience with Laravel and Vue.js, MySQL, RESTful APIs.',
                'location' => 'San Francisco, CA',
                'type' => 'full-time',
                'salary_from' => 85000,
                'salary_to' => 120000,
                'deadline' => now()->addDays(45),
                'is_active' => true,
            ],
            [
                'company_name' => 'Digital Innovations Ltd',
                'title' => 'PHP Backend Developer',
                'description' => 'We need a skilled PHP developer to work on enterprise applications and modernization projects.',
                'requirements' => 'Required: 4+ years PHP development, MySQL, Laravel or Symfony.',
                'location' => 'New York, NY',
                'type' => 'full-time',
                'salary_from' => 80000,
                'salary_to' => 110000,
                'deadline' => now()->addDays(20),
                'is_active' => true,
            ],
            [
                'company_name' => 'Digital Innovations Ltd',
                'title' => 'Junior Laravel Developer',
                'description' => 'Great opportunity for a junior developer to grow Laravel skills with mentorship from senior engineers.',
                'requirements' => 'Required: 1-2 years PHP experience, basic Laravel knowledge, MySQL, Git.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 55000,
                'salary_to' => 75000,
                'deadline' => now()->addDays(60),
                'is_active' => true,
            ],
            [
                'company_name' => 'Future Systems Corp',
                'title' => 'Laravel API Developer',
                'description' => 'Build robust RESTful APIs for our client projects with a focus on security and performance.',
                'requirements' => 'Required: 3+ years Laravel API development, OAuth/JWT, API documentation.',
                'location' => 'Austin, TX',
                'type' => 'full-time',
                'salary_from' => 75000,
                'salary_to' => 105000,
                'deadline' => now()->addDays(25),
                'is_active' => true,
            ],
            [
                'company_name' => 'Future Systems Corp',
                'title' => 'PHP Developer for AI Integration',
                'description' => 'Integrate AI/ML models into web applications using Laravel and modern API tooling.',
                'requirements' => 'Required: 3+ years Laravel/PHP, API integration, understanding of AI/ML concepts.',
                'location' => 'San Jose, CA',
                'type' => 'full-time',
                'salary_from' => 90000,
                'salary_to' => 125000,
                'deadline' => now()->addDays(38),
                'is_active' => true,
            ],
            [
                'company_name' => 'WebTech Solutions',
                'title' => 'DevOps Engineer (PHP/Laravel Background)',
                'description' => 'Bridge development and operations by setting up CI/CD pipelines and cloud infrastructure.',
                'requirements' => 'Required: Laravel/PHP experience, AWS or Azure, Docker, CI/CD, Linux administration.',
                'location' => 'Seattle, WA',
                'type' => 'full-time',
                'salary_from' => 95000,
                'salary_to' => 135000,
                'deadline' => now()->addDays(35),
                'is_active' => true,
            ],
            [
                'company_name' => 'WebTech Solutions',
                'title' => 'E-commerce Developer (Laravel)',
                'description' => 'Develop and maintain e-commerce platforms with payment gateways and inventory management.',
                'requirements' => 'Required: 3+ years Laravel, e-commerce experience, Stripe/PayPal integration.',
                'location' => 'Remote',
                'type' => 'contract',
                'salary_from' => 70000,
                'salary_to' => 95000,
                'deadline' => now()->addDays(30),
                'is_active' => true,
            ],
            [
                'company_name' => 'Nile Software House',
                'title' => 'Mid-Level React Developer',
                'description' => 'Build polished dashboards and customer portals for regional fintech and logistics clients.',
                'requirements' => 'Required: 2+ years React, TypeScript, REST APIs, responsive UI patterns.',
                'location' => 'Cairo, Egypt',
                'type' => 'full-time',
                'salary_from' => 35000,
                'salary_to' => 52000,
                'deadline' => now()->addDays(28),
                'is_active' => true,
            ],
            [
                'company_name' => 'Nile Software House',
                'title' => 'Product Designer',
                'description' => 'Own UX flows for mobile and web products from wireframes through high-fidelity prototypes.',
                'requirements' => 'Required: Figma expertise, design systems, user research basics.',
                'location' => 'Cairo, Egypt',
                'type' => 'full-time',
                'salary_from' => 30000,
                'salary_to' => 48000,
                'deadline' => now()->addDays(40),
                'is_active' => true,
            ],
            [
                'company_name' => 'CloudBridge Analytics',
                'title' => 'Data Engineer',
                'description' => 'Design ETL pipelines and analytics APIs that power executive dashboards.',
                'requirements' => 'Required: SQL, Python, data warehousing, pipeline orchestration.',
                'location' => 'Dubai, UAE',
                'type' => 'full-time',
                'salary_from' => 78000,
                'salary_to' => 110000,
                'deadline' => now()->addDays(22),
                'is_active' => true,
            ],
            [
                'company_name' => 'CloudBridge Analytics',
                'title' => 'Business Intelligence Analyst',
                'description' => 'Translate business questions into dashboards and recurring insights for enterprise stakeholders.',
                'requirements' => 'Required: Power BI or Tableau, SQL, stakeholder communication.',
                'location' => 'Dubai, UAE',
                'type' => 'full-time',
                'salary_from' => 65000,
                'salary_to' => 90000,
                'deadline' => now()->addDays(18),
                'is_active' => true,
            ],
            [
                'company_name' => 'Digital Innovations Ltd',
                'title' => 'Full Stack Startup Developer',
                'description' => 'Join a fast-paced product squad shipping MVPs and iterating quickly with founders.',
                'requirements' => 'Required: 2+ years full stack development, Laravel, Vue or React, startup mindset.',
                'location' => 'London, UK',
                'type' => 'full-time',
                'salary_from' => 70000,
                'salary_to' => 95000,
                'deadline' => now()->addDays(15),
                'is_active' => true,
            ],
            [
                'company_name' => 'Tech Solutions Inc',
                'title' => 'Remote Laravel Developer',
                'description' => 'Fully remote role building e-commerce solutions for global clients with flexible hours.',
                'requirements' => 'Required: 3+ years remote work experience, Laravel expertise, strong communication.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 75000,
                'salary_to' => 105000,
                'deadline' => now()->addDays(50),
                'is_active' => true,
            ],
            [
                'company_name' => 'Future Systems Corp',
                'title' => 'Part-time Laravel Consultant',
                'description' => 'Provide Laravel architecture guidance and code reviews on a flexible schedule.',
                'requirements' => 'Required: 5+ years Laravel, consulting experience, excellent communication.',
                'location' => 'Remote',
                'type' => 'part-time',
                'salary_from' => 60000,
                'salary_to' => 80000,
                'deadline' => now()->addDays(45),
                'is_active' => true,
            ],
        ];

        foreach ($jobs as $job) {
            $companyName = $job['company_name'];
            unset($job['company_name']);

            if (! isset($companyIds[$companyName])) {
                continue;
            }

            $job['company_id'] = $companyIds[$companyName];

            Job::updateOrCreate(
                [
                    'company_id' => $job['company_id'],
                    'title' => $job['title'],
                ],
                $job
            );
        }

        $this->command?->info('Jobs seeded successfully!');
    }
}
