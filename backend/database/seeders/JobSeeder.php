<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Job;
use App\Models\Company;

class JobSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $jobs = [
            // TechCorp Solutions Jobs
            [
                'company_id' => 1,
                'title' => 'Senior Laravel Developer',
                'description' => 'We are looking for an experienced Laravel developer to join our backend team. You will be working on building scalable web applications, RESTful APIs, and microservices. The ideal candidate has strong experience with Laravel, MySQL, Redis, and queue systems. You will collaborate with frontend developers and DevOps team to deliver high-quality software solutions.',
                'requirements' => 'Required: 5+ years PHP experience, 3+ years Laravel, MySQL, Redis, Git. Strong understanding of MVC architecture, RESTful APIs, authentication systems. Experience with testing (PHPUnit). Preferred: Vue.js, Docker, AWS, queue systems, Elasticsearch.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 90000,
                'salary_to' => 130000,
                'deadline' => now()->addDays(30),
                'is_active' => true,
            ],
            [
                'company_id' => 1,
                'title' => 'Full Stack Developer (Laravel + Vue.js)',
                'description' => 'Join our product team as a full stack developer working with Laravel backend and Vue.js frontend. You will build features end-to-end, from database design to user interface. We value clean code, good architecture, and user experience.',
                'requirements' => 'Required: 3+ years experience with Laravel and Vue.js, MySQL, RESTful APIs, responsive design. Good understanding of JavaScript ES6+, Vuex, Laravel Eloquent. Preferred: TypeScript, Tailwind CSS, Git workflows, Agile methodology.',
                'location' => 'San Francisco, CA',
                'type' => 'full-time',
                'salary_from' => 85000,
                'salary_to' => 120000,
                'deadline' => now()->addDays(45),
                'is_active' => true,
            ],

            // Digital Innovations Inc Jobs
            [
                'company_id' => 2,
                'title' => 'PHP Backend Developer',
                'description' => 'We need a skilled PHP developer to work on enterprise applications. You will maintain and enhance existing systems while building new features. Experience with legacy code modernization is a plus.',
                'requirements' => 'Required: 4+ years PHP development, MySQL, object-oriented programming, design patterns. Experience with Laravel or Symfony. Strong SQL skills. Preferred: Experience with legacy code refactoring, Docker, CI/CD, code reviews.',
                'location' => 'New York, NY',
                'type' => 'full-time',
                'salary_from' => 80000,
                'salary_to' => 110000,
                'deadline' => now()->addDays(20),
                'is_active' => true,
            ],
            [
                'company_id' => 2,
                'title' => 'Junior Laravel Developer',
                'description' => 'Great opportunity for a junior developer to grow their Laravel skills. You will work alongside senior developers, learning best practices and modern development techniques. We offer mentorship and career growth.',
                'requirements' => 'Required: 1-2 years PHP experience, basic Laravel knowledge, MySQL, Git. Passion for learning and coding. Preferred: Some experience with JavaScript, understanding of MVC, exposure to RESTful APIs.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 55000,
                'salary_to' => 75000,
                'deadline' => now()->addDays(60),
                'is_active' => true,
            ],

            // WebDev Masters Jobs
            [
                'company_id' => 3,
                'title' => 'Laravel API Developer',
                'description' => 'Build robust RESTful APIs for our client projects. You will design and implement APIs that power mobile apps and frontend applications. Strong focus on security, performance, and documentation.',
                'requirements' => 'Required: 3+ years Laravel API development, RESTful principles, authentication (OAuth, JWT), API documentation, MySQL. Experience with rate limiting, versioning. Preferred: GraphQL, microservices, API testing, Postman/Insomnia.',
                'location' => 'Austin, TX',
                'type' => 'full-time',
                'salary_from' => 75000,
                'salary_to' => 105000,
                'deadline' => now()->addDays(25),
                'is_active' => true,
            ],
            [
                'company_id' => 3,
                'title' => 'E-commerce Developer (Laravel)',
                'description' => 'Develop and maintain e-commerce platforms for our clients. Experience with payment gateways, inventory management, and shopping cart functionality required. You will work on custom e-commerce solutions.',
                'requirements' => 'Required: 3+ years Laravel, e-commerce experience, payment gateway integration (Stripe, PayPal), MySQL, session management. Preferred: Experience with Shopify/WooCommerce APIs, inventory systems, shipping integrations, multi-currency.',
                'location' => 'Remote',
                'type' => 'contract',
                'salary_from' => 70000,
                'salary_to' => 95000,
                'deadline' => now()->addDays(30),
                'is_active' => true,
            ],

            // Cloud Systems Co Jobs
            [
                'company_id' => 4,
                'title' => 'DevOps Engineer (PHP/Laravel Background)',
                'description' => 'We need a DevOps engineer with PHP/Laravel development background to bridge development and operations. You will set up CI/CD pipelines, manage cloud infrastructure, and optimize application performance.',
                'requirements' => 'Required: Laravel/PHP development experience, AWS or Azure, Docker, CI/CD (GitHub Actions, Jenkins), Linux administration, Nginx/Apache. Preferred: Kubernetes, Terraform, monitoring tools (New Relic, DataDog), Laravel Forge/Vapor.',
                'location' => 'Seattle, WA',
                'type' => 'full-time',
                'salary_from' => 95000,
                'salary_to' => 135000,
                'deadline' => now()->addDays(35),
                'is_active' => true,
            ],

            // Data Analytics Pro Jobs
            [
                'company_id' => 4,
                'title' => 'Backend Developer for Analytics Platform',
                'description' => 'Build backend systems for our data analytics platform. You will work with large datasets, create ETL pipelines, and build APIs for data visualization. Laravel knowledge combined with data processing skills is essential.',
                'requirements' => 'Required: 3+ years Laravel, experience with large datasets, MySQL optimization, data processing, API development. Preferred: Experience with Elasticsearch, Redis, queue processing, data warehousing, Python for data scripts.',
                'location' => 'Boston, MA',
                'type' => 'full-time',
                'salary_from' => 85000,
                'salary_to' => 115000,
                'deadline' => now()->addDays(40),
                'is_active' => true,
            ],

            // Mobile First Studios Jobs
            [
                'company_id' =>3,
                'title' => 'Mobile Backend Developer (Laravel)',
                'description' => 'Create and maintain APIs for our mobile applications. You will work closely with iOS and Android developers to ensure smooth app experiences. Focus on performance, security, and scalability.',
                'requirements' => 'Required: 3+ years Laravel API development, experience with mobile backends, push notifications, real-time features, MySQL. Understanding of mobile app requirements. Preferred: Firebase, WebSockets, OAuth, app analytics integration.',
                'location' => 'Los Angeles, CA',
                'type' => 'full-time',
                'salary_from' => 80000,
                'salary_to' => 110000,
                'deadline' => now()->addDays(28),
                'is_active' => true,
            ],

            // FinTech Innovations Jobs
            [
                'company_id' => 2,
                'title' => 'Senior Laravel Developer (FinTech)',
                'description' => 'Work on financial applications requiring high security and reliability. You will build payment systems, transaction processing, and financial reporting features. FinTech experience is highly valued.',
                'requirements' => 'Required: 5+ years Laravel, financial application experience, security best practices, PCI compliance knowledge, MySQL, transaction management. Strong testing practices. Preferred: Payment processing, banking APIs, financial calculations, audit logging.',
                'location' => 'Chicago, IL',
                'type' => 'full-time',
                'salary_from' => 100000,
                'salary_to' => 145000,
                'deadline' => now()->addDays(22),
                'is_active' => true,
            ],

            // E-Commerce Solutions Ltd Jobs
            [
                'company_id' => 1,
                'title' => 'Remote Laravel Developer',
                'description' => 'Fully remote position for an experienced Laravel developer. Work from anywhere while building e-commerce solutions for global clients. Flexible hours with focus on results.',
                'requirements' => 'Required: 3+ years remote work experience, Laravel expertise, self-motivated, excellent communication, MySQL, Git. Ability to work independently. Preferred: E-commerce experience, multiple timezone collaboration, agile workflows.',
                'location' => 'Remote',
                'type' => 'full-time',
                'salary_from' => 75000,
                'salary_to' => 105000,
                'deadline' => now()->addDays(50),
                'is_active' => true,
            ],

            // AI Research Labs Jobs
            [
                'company_id' => 3,
                'title' => 'PHP Developer for AI Integration',
                'description' => 'Integrate AI/ML models into web applications using Laravel. You will work with data scientists to bring AI capabilities to production. Unique opportunity to work at intersection of web development and AI.',
                'requirements' => 'Required: 3+ years Laravel/PHP, API integration experience, MySQL, understanding of AI/ML concepts. Ability to learn quickly. Preferred: Experience with OpenAI API, Python basics, vector databases, data processing, RAG systems.',
                'location' => 'San Jose, CA',
                'type' => 'full-time',
                'salary_from' => 90000,
                'salary_to' => 125000,
                'deadline' => now()->addDays(38),
                'is_active' => true,
            ],

            // Startup Hub Inc Jobs
            [
                'company_id' => 2,
                'title' => 'Full Stack Startup Developer',
                'description' => 'Join a fast-paced startup environment wearing multiple hats. Build MVPs, iterate quickly, and ship features daily. Perfect for developers who love variety and rapid development.',
                'requirements' => 'Required: 2+ years full stack development, Laravel, JavaScript framework (Vue/React), MySQL, fast learner, adaptable. Startup mentality. Preferred: MVP development, rapid prototyping, multiple tech stacks, scrappy problem-solving.',
                'location' => 'Denver, CO',
                'type' => 'full-time',
                'salary_from' => 70000,
                'salary_to' => 95000,
                'deadline' => now()->addDays(15),
                'is_active' => true,
            ],

            // Additional Part-time/Contract positions
            [
                'company_id' => 3,
                'title' => 'Part-time Laravel Consultant',
                'description' => 'Provide Laravel expertise to our client projects on a part-time basis. Review code, architect solutions, and mentor junior developers. Flexible schedule.',
                'requirements' => 'Required: 5+ years Laravel expert level, consulting/mentoring experience, excellent communication, architectural knowledge. Preferred: Multiple project experience, code review expertise, performance optimization skills.',
                'location' => 'Remote',
                'type' => 'part-time',
                'salary_from' => 60000,
                'salary_to' => 80000,
                'deadline' => now()->addDays(45),
                'is_active' => true,
            ],
            [
                'company_id' => 4,
                'title' => 'Contract Laravel Developer (3 months)',
                'description' => 'Short-term contract to help with a major platform migration. You will modernize legacy code and implement new features. Potential for extension or full-time conversion.',
                'requirements' => 'Required: Strong Laravel skills, experience with code modernization, MySQL, Git, available for 3-month commitment. Preferred: Legacy system experience, database migration, testing, documentation.',
                'location' => 'Remote',
                'type' => 'contract',
                'salary_from' => 65000,
                'salary_to' => 85000,
                'deadline' => now()->addDays(10),
                'is_active' => true,
            ],
        ];

        foreach ($jobs as $job) {
            Job::create($job);
        }

        $this->command->info('Jobs seeded successfully!');
    }
}
