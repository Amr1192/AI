<?php

namespace App\Http\Middleware;

use Closure;

class DisableCors
{
    public function handle($request, Closure $next)
    {
        $response = $next($request);

        $response->headers->set('Access-Control-Allow-Origin', '*');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

        // Handle preflight requests (OPTIONS)
        if ($request->getMethod() === "OPTIONS") {
            return response('', 204, $response->headers->all());
        }

        return $response;
    }
}
