<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Job;
use Illuminate\Support\Facades\Hash;
use App\Models\JobApplication;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class AdminController extends Controller
{

    public function users()
    {
        $users = User::with('profile')->paginate(10);
        return response()->json($users);
    }
   
    public function addUser(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:users',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'required|in:user,admin',
        ], [
            'email.unique' => 'This email is already exist.',
            'name.unique' => 'This name is already exist.',
            'role.in' => 'Invalid role.',
            'role.required' => 'Role is required.',
            'email.required' => 'Email is required.',
            'email.email' => 'Invalid email format.',
            'email.max' => 'Email must be less than 255 characters.',
            'password.required' => 'Password is required.',
            'password.min' => 'Password must be at least 8 characters.',
            'name.required' => 'Name is required.',
            'name.max' => 'Name must be less than 255 characters.',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
        ]);

        return response()->json([
            'message' => 'User added successfully',
            'user' => $user,
        ], 201);
    }

    public function updateUser(Request $request, User $user)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255||unique:users,name,',
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'sometimes|string|min:8|confirmed',
            'role' => 'sometimes|in:user,admin',
            'skills' => 'sometimes|array',
            'skills.*.title' => 'required_with:skills|string|max:255',
            'skills.*.years_of_experience' => 'required_with:skills|integer|min:0',
            'skills.*.proficiency_level' => 'required_with:skills|in:beginner,intermediate,expert',
        ]);

        if ($validator->fails()) {
            // Special message for duplicated email
            if (isset($validator->errors()->toArray()['email'])) {
                return response()->json([
                    'message' => 'This email is already exist.',
                ], 422);
            }

            return response()->json($validator->errors(), 422);
        }

        try {
            // Store old values before updating
            $oldData = $user->only(['name', 'email', 'role']);

            // Update user data
            $user->update($request->only(['name', 'email', 'role']));

            if ($request->filled('password')) {
                $user->password = bcrypt($request->password);
            }

            $user->save();

            // Compare old and new data to know what changed
            $changes = [];
            foreach ($oldData as $key => $oldValue) {
                if ($user->$key !== $oldValue) {
                    switch ($key) {
                        case 'name':
                            $changes[] = 'Name was updated successfully.';
                            break;
                        case 'email':
                            $changes[] = 'Email was updated successfully.';
                            break;
                        case 'role':
                            $changes[] = 'Role was updated successfully.';
                            break;
                    }
                }
            }

            if ($request->filled('password')) {
                $changes[] = 'Password was updated successfully.';
            }

            $message = !empty($changes)
                ? implode(' ', $changes)
                : 'No changes were made.';

            return response()->json([
                'message' => $message,
                'user' => $user,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update user data.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }


    public function jobs()
    {
        $jobs = Job::with(['company', 'applications'])->orderBy('created_at', 'desc')->paginate(10);
        return response()->json($jobs);
    }
    public function companies()
    {
        $companies = Company::paginate(10);
        return response()->json($companies);
    }


   public function createJob(Request $request)
    {
        // Normalize the type value to lowercase
        $data = $request->all();
        if (isset($data['type'])) {
            $data['type'] = strtolower($data['type']);
        }

        $validator = Validator::make($data, [
            'company_id' => 'required|exists:companies,id',
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'requirements' => 'required|string',
            'location' => 'required|string|max:255',
            'type' => 'required|in:full-time,part-time,contract,internship',
            'salary_from' => 'nullable|numeric|min:0',
            'salary_to' => 'nullable|numeric|min:0',
            'deadline' => 'nullable|date|after:today',
            'is_active' => 'nullable|boolean',
        ], [
            'company_id.required' => 'Please select a company',
            'company_id.exists' => 'Selected company does not exist',
            'title.required' => 'Job title is required',
            'description.required' => 'Job description is required',
            'requirements.required' => 'Job requirements are required',
            'location.required' => 'Location is required',
            'type.required' => 'Job type is required',
            'type.in' => 'Job type must be one of: full-time, part-time, contract, internship',
            'salary_from.numeric' => 'Salary from must be a number',
            'salary_to.numeric' => 'Salary to must be a number',
            'deadline.after' => 'Deadline must be a future date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 422);
        }

        // Additional validation: salary_to must be greater than salary_from
        if ($request->filled('salary_from') && $request->filled('salary_to')) {
            if ($request->salary_to <= $request->salary_from) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'salary_to' => ['Salary to must be greater than salary from']
                    ]
                ], 422);
            }
        }

        try {
            $job = Job::create([
                'company_id' => $data['company_id'],
                'title' => $data['title'],
                'description' => $data['description'],
                'requirements' => $data['requirements'],
                'location' => $data['location'],
                'type' => $data['type'], // Now normalized to lowercase
                'salary_from' => $data['salary_from'] ?? null,
                'salary_to' => $data['salary_to'] ?? null,
                'deadline' => $data['deadline'] ?? null,
                'is_active' => $data['is_active'] ?? true,
            ]);

            return response()->json([
                'message' => 'Job created successfully',
                'job' => $job->load('company'),
            ], 201);
        } catch (\Exception $e) {
            Log::error('Failed to create job: ' . $e->getMessage());

            return response()->json([
                'message' => 'Failed to create job',
                'error' => $e->getMessage()
            ], 500);
        }
    }

//---------------------------------  Generate description for Job

    public function generateDescription(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'requirements' => 'nullable|string',
            'type' => 'nullable|string',
            'location' => 'nullable|string',
        ]);

       
        try {
$prompt = "
        Generate a professional job description for the following job:

        Job Title: {$request->title}

        ⚠️ RULES:
        - Only provide a clear job description (about 5 short sentences).
        - Do NOT mention company name, benefits, requirements, salary, location, job type, or application process.
        - Focus solely on describing the role and responsibilities.
        ";
            $response = Http::withToken(env('OPENAI_API_KEY'))
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => 'gpt-4o-mini',
                    'messages' => [
                        ['role' => 'system', 'content' => 'You are an HR assistant'],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'temperature' => 0.7,
                ]);

            $description = $response['choices'][0]['message']['content'] ?? '';

            return response()->json([
                'description' => $description
            ]);
        }
         catch (\Exception $e) {
            return response()->json([
                'message' => 'AI generation failed',
                'error' => $e->getMessage()
            ], 500);
        }
   }
    public function createCompany(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'location' => 'required|string|max:255',
            'description' => 'nullable|string',
            'website' => 'nullable|url',
            'logo' => 'nullable|image|mimes:jpeg,png,jpg|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $company = new Company($request->except('logo'));

        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('company-logos', 'public');
            $company->logo = $path;
        }

        $company->save();

        return response()->json([
            'message' => 'Company created successfully',
            'company' => $company,
        ], 201);
    }

    public function updateJobStatus(Request $request, Job $job)
    {
        $validator = Validator::make($request->all(), [
            'is_active' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $job->update(['is_active' => $request->is_active]);
        // $job->update($request->all());

        return response()->json([
            'message' => 'Job status updated successfully',
            'job' => $job,
        ]);
    }


    public function updateJob(Request $request, Job $job)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'salary' => 'sometimes|numeric|min:0',
            'is_active' => 'sometimes|boolean',
            'deadline' => 'sometimes|date|after:today',
            'requirements' => 'sometimes|string',
            'location' => 'sometimes|string|max:255',
            'type' => 'sometimes|in:full-time,part-time,Full-Time,Part-Time,contract',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        try {
            $job->update($request->all());
            $job->save();
            return response()->json([
                'message' => 'Job updated successfully',
                'job' => $job,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update job',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

  

public function updateCompany(Request $request, Company $company)
{
    // Validate everything except logo
    $validator = Validator::make($request->all(), [
        'name' => 'sometimes|string|max:255',
        'location' => 'sometimes|string|max:255',
        'description' => 'sometimes|string',
        'website' => 'sometimes|url',
    ]);

    if ($validator->fails()) {
        return response()->json($validator->errors(), 422);
    }

    try {
        // Handle 'logo' separately
        if ($request->hasFile('logo')) {
            $file = $request->file('logo');
            $filename = time() . '_' . $file->getClientOriginalName();
            $file->move(public_path('uploads/logos'), $filename);
            $logo = $filename;
        } elseif ($request->has('logo')) {
            // If logo is sent as string
            $logo = $request->input('logo');
        } else {
            $logo = $company->logo; // keep existing logo if nothing is sent
        }

        // Update company with all fields
        $company->update([
            'name' => $request->input('name', $company->name),
            'location' => $request->input('location', $company->location),
            'description' => $request->input('description', $company->description),
            'website' => $request->input('website', $company->website),
            'logo' => $logo,
        ]);

        return response()->json([
            'message' => 'Company updated successfully',
            'company' => $company,
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'message' => 'Failed to update company',
            'error' => $e->getMessage(),
        ], 500);
    }
}

    public function updateApplicationStatus(Request $request, $applicationId)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:pending,reviewed,shortlisted,rejected,accepted',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $application = JobApplication::findOrFail($applicationId);
        $application->update(['status' => $request->status]);

        return response()->json([
            'message' => 'Application status updated successfully',
            'application' => $application->load(['user', 'job']),
        ]);
    }

    public function deleteUser($userID)
    {

        try {
            $user = user::findOrFail($userID);
            $user->delete();
            return response()->json([
                'message' => 'user deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete user',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
    public function deleteJob($jobID)
    {

        try {
            $job = Job::findOrFail($jobID);
            $job->delete();
            return response()->json([
                'message' => 'Job deleted successfully',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete job',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

  

    public function deleteCompany(Company $company)
{
    // Delete jobs linked to company
    Job::where('company_id', $company->id)->delete();

    // Delete company
    $company->delete();

    return response()->json([
        'message' => 'Company deleted successfully'
    ]);
}

}
