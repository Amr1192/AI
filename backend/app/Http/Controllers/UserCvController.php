<?php

namespace App\Http\Controllers;

use App\Models\UserCv;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;

class UserCvController extends Controller
{
    public function store(Request $request)
    {
        try {
            Log::info('CV Save Request', [
                'user_id' => optional(Auth::user())->id,
                'has_cv_json' => $request->has('cv_json'),
            ]);


            $validated = $request->validate([
                'cv_json' => 'required',
                'title' => 'nullable|string|max:255',
            ]);

            $cv = UserCv::create([
                 'user_id' => optional(Auth::user())->id,
                'cv_json' => $validated['cv_json'],
                'title' => $validated['title'] ?? 'My CV - ' . now()->format('Y-m-d H:i'),
            ]);

            Log::info('CV Saved Successfully', ['cv_id' => $cv->id]);

            return response()->json([
                'message' => 'CV saved successfully',
                'cv' => $cv
            ], 201);

        } catch (\Exception $e) {
            Log::error('CV Save Failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'error' => 'Failed to save CV',
                'message' => $e->getMessage()
            ], 500);
        }
    }
}


