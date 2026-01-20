<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Services\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class CVAnalysisController extends Controller
{
    private $geminiService;

    public function __construct(GeminiService $geminiService)
    {
        $this->geminiService = $geminiService;
    }

    public function analyze(Request $request)
    {
        // Validate file is present and is a PDF or DOCX
        $request->validate([
            'cv' => 'required|file|mimes:pdf,doc,docx|max:10240' // Max 10MB
        ]);

        // Handle file upload and store temporarily
        $file = $request->file('cv');
        $path = $file->store('temp');
        // Use Storage facade to get the correct path
        $fullPath = Storage::path($path);
        $extension = strtolower($file->getClientOriginalExtension());
        
        // Verify file exists before processing
        if (!file_exists($fullPath)) {
            return response()->json([
                'success' => false,
                'error' => 'File was not saved correctly. Please try again.'
            ], 500);
        }

        try {
            // Extract text from the file
            $text = '';
            
            if ($extension === 'pdf') {
                $text = $this->extractTextFromPdf($fullPath);
            } elseif (in_array($extension, ['doc', 'docx'])) {
                $text = $this->extractTextFromDocx($fullPath);
            } else {
                Storage::delete($path);
                return response()->json([
                    'success' => false,
                    'error' => 'Unsupported file type. Please upload a PDF or DOCX file.'
                ], 400);
            }

            if (empty(trim($text))) {
                Storage::delete($path);
                return response()->json([
                    'success' => false,
                    'error' => 'Could not extract text from the file. Please ensure the file is not corrupted or password-protected.'
                ], 400);
            }

            // Use Google Gemini API to analyze CV
            $analysisResult = $this->geminiService->analyzeCv($text);

            // Clean up file
            Storage::delete($path);

            // Return Analysis Result
            return response()->json([
                'success' => true,
                'result' => $analysisResult
            ]);
        } catch (\Exception $e) {
            Storage::delete($path);
            Log::error('CV Analysis Error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Extract text from PDF file
     *
     * @param string $filePath
     * @return string
     */
    private function extractTextFromPdf(string $filePath): string
    {
        try {
            // Verify file exists
            if (!file_exists($filePath)) {
                throw new \Exception("PDF file not found at path: {$filePath}");
            }
            
            // Try using smalot/pdfparser if available
            if (class_exists('Smalot\PdfParser\Parser')) {
                $parser = new \Smalot\PdfParser\Parser();
                $pdf = $parser->parseFile($filePath);
                return $pdf->getText();
            }
            
            // Fallback: Try using shell command if available
            if (function_exists('shell_exec') && $this->commandExists('pdftotext')) {
                $text = shell_exec("pdftotext - \"{$filePath}\" - 2>&1");
                return $text ?: '';
            }
            
            throw new \Exception('PDF parsing library not available. Please install smalot/pdfparser package.');
        } catch (\Exception $e) {
            Log::error('PDF extraction error: ' . $e->getMessage(), [
                'file_path' => $filePath,
                'file_exists' => file_exists($filePath)
            ]);
            throw new \Exception('Failed to extract text from PDF: ' . $e->getMessage());
        }
    }

    /**
     * Extract text from DOCX file
     *
     * @param string $filePath
     * @return string
     */
    private function extractTextFromDocx(string $filePath): string
    {
        try {
            // Verify file exists
            if (!file_exists($filePath)) {
                throw new \Exception("DOCX file not found at path: {$filePath}");
            }
            
            // DOCX files are ZIP archives containing XML files
            $zip = new \ZipArchive();
            
            if ($zip->open($filePath) !== true) {
                throw new \Exception('Failed to open DOCX file. File may be corrupted.');
            }

            // Read the main document XML
            $documentXml = $zip->getFromName('word/document.xml');
            $zip->close();

            if ($documentXml === false) {
                throw new \Exception('Could not read document content from DOCX file.');
            }

            // Extract text from XML (simple approach)
            // Remove XML tags and decode entities
            $text = strip_tags($documentXml);
            $text = html_entity_decode($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
            
            // Clean up whitespace
            $text = preg_replace('/\s+/', ' ', $text);
            $text = trim($text);

            return $text;
        } catch (\Exception $e) {
            Log::error('DOCX extraction error: ' . $e->getMessage());
            throw new \Exception('Failed to extract text from DOCX: ' . $e->getMessage());
        }
    }

    /**
     * Check if a command exists
     *
     * @param string $command
     * @return bool
     */
    private function commandExists(string $command): bool
    {
        if (PHP_OS_FAMILY === 'Windows') {
            $where = `where $command 2>nul`;
            return !empty($where);
        } else {
            $which = shell_exec("which $command");
            return !empty($which);
        }
    }
}