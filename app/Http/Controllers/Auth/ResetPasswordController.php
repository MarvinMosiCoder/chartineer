<?php

namespace App\Http\Controllers\Auth;
use App\Http\Controllers\Controller;
use App\Mail\Mailer;
use App\Models\AdmUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use DB;
use Carbon\Carbon;

class ResetPasswordController extends Controller
{

    public function sendResetPasswordInstructions(Request $request){
        $key = Str::random(32);
        $iv = Str::random(16);
        
        $request->validate([
            'email' => 'required|email|exists:adm_users,email',
        ]);
        
        $encryptedEmail = openssl_encrypt($request->email, 'aes-256-cbc', $key, 0, $iv);
        $encryptedEmailBase64 = base64_encode($encryptedEmail);

        session(['encryption_key' => $key, 'encryption_iv' => $iv]);
       
        $subject = "Reset Password";
        $cleanEncryptedEmail = str_replace('/', '_', $encryptedEmailBase64);


        Mail::to($request->email)->send(new Mailer($subject,$cleanEncryptedEmail));

    }

    public function resetPassword(Request $request){
        $key = session('encryption_key');
        $iv = session('encryption_iv');
  
        if (!$key || !$iv) {
            return json_encode(["message"=>"Request expired, please request another one", "status"=>"error", 'redirect'=>url('admin/login')]);
        }

        $encryptedEmail = base64_decode(str_replace('_', '/', $request->email));
        $decryptedEmail = openssl_decrypt($encryptedEmail, 'aes-256-cbc', $key, 0, $iv);
   
        if ($decryptedEmail === false) {
            return json_encode(["message"=>"Request expired, please request another one", "status"=>"error", 'redirect'=>url('admin/login')]);
        }
		//Check if password exist in history
		$user = AdmUser::where('email',$decryptedEmail)->first();
		$passwordHistory = DB::table('adm_password_histories')->where('adm_user_id',$user->id)->get()->toArray();
		$isExist = array_column($passwordHistory, 'adm_user_old_pass');

		if(!self::checkPasswordInArray($request->get('new_password'), $isExist)) {
			$user = AdmUser::where('email', $decryptedEmail)->first();
			$request->validate([
				'new_password' => 'required',
				'confirm_password' => 'required|same:new_password'
			]);

			$user->waiver_count = 0;
			$user->	last_password_updated = now();
			$user->password = Hash::make($request->get('new_password'));
			$user->password_login_enabled = true;
			$user->save();

			DB::table('adm_password_histories')->insert([
				'adm_user_id' => $user->id,
				'adm_user_old_pass' => $user->password,
				'created_at' => date('Y-m-d h:i:s')
			]);

			session()->forget('encryption_key');
			session()->forget('encryption_iv');
			return json_encode(["message"=>"Password successfully reset, you will be redirect to login!", "status"=>"success"]);
		}else{
			return json_encode(["message"=>"Password not available, please try another one!"]);
		}
        
    }

    // Function to check if the new password matches any hashed password
	function checkPasswordInArray($newPassword, $hashedPasswords) {
		foreach ($hashedPasswords as $hashedPassword) {
			if (Hash::check($newPassword, $hashedPassword)) {
				return true; // Password exists in the array
			}
		}
		return false; // Password does not exist
	}

    public function getIndex()
    {
        return Inertia::render('Auth/ResetPassword');
    }

    public function getResetIndex($email){

        return Inertia::render('Auth/ResetPasswordEmail', [
            'email' => $email
        ]);

    }
    
}
