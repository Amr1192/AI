<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'phone_number',
        'location',
        'professional_bio',
        'years_of_experience',
        'profile_picture',
        'cv_json',
        'embedding',
        'embedding_text',
        'embedding_generated_at',
    ];


        protected $casts = [
        'cv_json' => 'array',
        'embedding' => 'array',
        'embedding_generated_at' => 'datetime',
        'years_of_experience' => 'integer',
    ];

    
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
