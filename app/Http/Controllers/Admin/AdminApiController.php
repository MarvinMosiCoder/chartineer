<?php

namespace App\Http\Controllers\Admin;
use app\Helpers\CommonHelpers;
use App\Http\Controllers\Controller;
use App\Models\AdmModels\ApiConfiguration;
use App\Models\AdmModels\ApiKeys;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class AdminApiController extends Controller
{

    private $sortBy;
    private $sortDir;
    private $perPage;

    public function __construct() {
        $this->middleware('admin.permission:api_generator,view')->only('getIndex');
        $this->middleware('admin.permission:api_generator,create')->only(['createKey', 'createApiView', 'createApi']);
        $this->middleware('admin.permission:api_generator,edit')->only(['deactivateKey', 'activateKey', 'editApi', 'updateApi']);
        $this->middleware('admin.permission:api_generator,read')->only('viewApi');
        $this->middleware('admin.permission:api_generator,delete')->only(['deleteKey', 'bulkActions']);
        $this->sortBy = request()->get('sortBy', 'api_configurations.created_at');
        $this->sortDir = request()->get('sortDir', 'desc');
        $this->perPage = request()->get('perPage', 10);
    }

    public function getAllData(){
        $query = ApiConfiguration::query();
        $filter = $query->searchAndFilter(request());
        $result = $filter->orderBy($this->sortBy, $this->sortDir);
        return $result;
    }


    public function getIndex()
    {

        $databaseName = config('database.connections.mysql.database');
        $tables = DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = ?", [$databaseName]);

        $data['database_tables_and_columns'] = [];
        foreach ($tables as $table) {
            $tableName = $table->TABLE_NAME;

            $columns = Schema::getColumnListing($tableName);

            $data['database_tables_and_columns'][] = [
                'table_name' => $tableName,
                'columns' => $columns
            ];
        }

        $data['page_title'] = 'Api Generator';

        $data['api'] = self::getAllData()->paginate($this->perPage)->withQueryString();
        $data['queryParams'] = request()->query();

        $data['secret_key'] = ApiKeys::all();

        return Inertia::render('AdmVram/ApiGenerator', $data);
    }

    public function createKey()
    {
        $random = bin2hex(random_bytes(32));
        $apiKey = hash_hmac('sha256', $random, config('app.key'));

        try {
            ApiKeys::create([
                'secret_key' => $apiKey,
                'status' => ApiKeys::STATUS_ACTIVE,
                'created_by' => CommonHelpers::myId(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return back()->with(['message' => 'API Generation Success!', 'type' => 'success']);
        } catch (\Exception $e) {
            CommonHelpers::LogSystemError('API Key Generator', $e->getMessage());
            return back()->with(['message' => 'API Key Generation Failed!', 'type' => 'error']);
        }
    }

    public function deactivateKey($id)
    {
        if (!$id || $id === 'undefined' || $id === null) {
            return back()->with(['message' => 'Missing api key ID!', 'type' => 'error']);
        }

        try {

            $apiKey = ApiKeys::find($id);

            if (!$apiKey) {
                return back()->with(['message' => 'API Key not found!', 'type' => 'error']);
            }

            $updated = $apiKey->update([
                'status' => ApiKeys::STATUS_REVOKED,
                'updated_by' => CommonHelpers::myId(),
                'updated_at' => now()
            ]);

            if ($updated) {
                return back()->with([
                    'message' => 'API Key Deactivation Success!',
                    'type' => 'success'
                ]);
            }

            return back()->with(['message' => 'No changes made to the API Key!', 'type' => 'error']);
        } catch (\Exception $e) {

            CommonHelpers::LogSystemError('API Key Deactivation', $e->getMessage());
            return back()->with(['message' => 'API Key Deactivation Failed!', 'type' => 'error']);
        }
    }

    public function activateKey($id)
    {
        if (!$id || $id === 'undefined' || $id === null) {
            return back()->with(['message' => 'Missing api key ID!', 'type' => 'error']);
        }

        try {

            $apiKey = ApiKeys::find($id);

            if (!$apiKey) {
                return back()->with(['message' => 'API Key not found!', 'type' => 'error']);
            }

            $updated = $apiKey->update([
                'status' => ApiKeys::STATUS_ACTIVE,
                'updated_by' => CommonHelpers::myId(),
                'updated_at' => now()
            ]);

            if ($updated) {
                return back()->with([
                    'message' => 'API Key Activation Success!',
                    'type' => 'success'
                ]);
            }

            return back()->with(['message' => 'No changes made to the API Key!', 'type' => 'error']);
        } catch (\Exception $e) {

            CommonHelpers::LogSystemError('API Key Activation', $e->getMessage());
            return back()->with(['message' => 'API Key Deactivation Failed!', 'type' => 'error']);
        }
    }

    public function deleteKey($id)
    {
        if (!$id || $id === 'undefined' || $id === null) {
            return back()->with(['message' => 'Missing API key ID!', 'type' => 'error']);
        }

        try {
            $apiKey = ApiKeys::find($id);

            if (!$apiKey) {
                return back()->with(['message' => 'API Key not found!', 'type' => 'error']);
            }

            $deleted = $apiKey->update([
                'status' => ApiKeys::STATUS_REVOKED,
                'deleted_at' => now()
            ]);

            if ($deleted) {
                return back()->with([
                    'message' => 'API Key successfully deleted!',
                    'type' => 'success'
                ]);
            }

            return back()->with(['message' => 'Failed to delete API Key!', 'type' => 'error']);
        } catch (\Exception $e) {
            CommonHelpers::LogSystemError('API Key Deletion', "ID: {$id} | Error: " . $e->getMessage());
            return back()->with(['message' => 'API Key Deletion Failed!', 'type' => 'error']);
        }
    }

    public function createApiView(){
        $databaseName = config('database.connections.mysql.database');
        $tables = DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = ?", [$databaseName]);

        $data['table_columns'] = [];
        foreach ($tables as $table) {
            $tableName = $table->TABLE_NAME;

            $columns = Schema::getColumnListing($tableName);

            $data['table_columns'][] = [
                'table_name' => $tableName,
                'columns' => $columns
            ];
        }

        $data['page_title'] = 'Api Generate';


        return Inertia::render('AdmVram/ApiGenerator/ApiGeneratorCreate', $data);
    }

    public function createApi(Request $request)
    {

        $request_data = $request->validate([
            'api_name' => 'required|string|unique:api_configurations,name',
            'api_endpoint' => 'required|string|unique:api_configurations,endpoint',
            'table' => 'required|string',
            'action_type' => 'required|string',
            'api_method' => 'required|string',
            'sql_where' => 'nullable|string',
            'fields' => 'required|array',
            'fields_relations' => 'nullable|array',
            'fields_validations' => 'nullable|array',
        ]);

        try {
            
            ApiConfiguration::create([
                'name' => $request_data['api_name'],
                'table_name' => $request_data['table'],
                'fields' => $request_data['fields'],
                'relations' => $request_data['fields_relations'],
                'rules' => $request_data['fields_validations'],
                'sql_parameter' => $request_data['sql_where'],
                'endpoint' => $request_data['api_endpoint'],
                'method' => strtoupper($request_data['api_method']),
                'action_type' => $request_data['action_type'],
                'auth_type' => 'X-API-KEY',
                'rate_limit' => 60,
                'created_at' => now(),
                'created_by' => CommonHelpers::myId(),
            ]);

            return redirect('api_generator')->with(['message' => 'API successfully created!', 'type' => 'success']);
        } catch (\Exception $e) {
            CommonHelpers::LogSystemError('API Generator (Creation)', $e->getMessage());
            return back()->with(['message' => 'API Creation Failed!', 'type' => 'error']);
        }
    }

    public function updateApi(Request $request){

        $request_data = $request->validate([
            'api_name' => 'required|string',
            'api_endpoint' => 'required|string',
            'table' => 'required|string',
            'action_type' => 'required|string',
            'api_method' => 'required|string',
            'sql_where' => 'nullable|string',
            'fields' => 'required|array',
            'fields_relations' => 'nullable|array',
            'fields_validations' => 'nullable|array',
        ]);

        try {
            
            $api = ApiConfiguration::find($request->id);

            $apiNameExist = ApiConfiguration::where('name', $request_data['api_name'])->exists();
            $apiEndpointExist = ApiConfiguration::where('endpoint', $request_data['api_endpoint'])->exists();

            if ($request_data['api_name'] !== $api->name) {
                if (!$apiNameExist) {
                    $api->name = $request_data['api_name'];
                } else {
                    return back()->withErrors(['api_name' => 'API Name already exists', 'type' => 'error']);
                }
            }

            if ($request_data['api_endpoint'] !== $api->endpoint) {
                if (!$apiEndpointExist) {
                    $api->endpoint = $request_data['api_endpoint'];
                } else {
                    return back()->withErrors(['api_endpoint' => 'API Endpoint already exists', 'type' => 'error']);
                }
            }

            $api->table_name = $request_data['table'];
            $api->fields = $request_data['fields'];
            $api->relations = $request_data['fields_relations'];
            $api->rules = $request_data['fields_validations'];
            $api->sql_parameter = $request_data['sql_where'];
            $api->method = $request_data['api_method'];
            $api->action_type = $request_data['action_type'];

            $api->save();

            return redirect('api_generator')->with(['message' => 'API successfully created!', 'type' => 'success']);

        } catch (\Exception $e) {
            CommonHelpers::LogSystemError('API Generator (Update)', $e->getMessage());
            return back()->with(['message' => 'API Updating Failed!', 'type' => 'error']);
        }
    }

    public function editApi($id){
        $databaseName = config('database.connections.mysql.database');
        $tables = DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = ?", [$databaseName]);

        $data['table_columns'] = [];
        foreach ($tables as $table) {
            $tableName = $table->TABLE_NAME;

            $columns = Schema::getColumnListing($tableName);

            $data['table_columns'][] = [
                'table_name' => $tableName,
                'columns' => $columns
            ];
        }

        $data['page_title'] = 'Api Edit';
        $data['api'] = ApiConfiguration::where('id', $id)->first();

        return Inertia::render('AdmVram/ApiGenerator/ApiGeneratorEdit', $data);
    }

    public function viewApi($id){

        $data['page_title'] = 'Api Edit';
        $data['api'] = ApiConfiguration::where('id', $id)->first();

        return Inertia::render('AdmVram/ApiGenerator/ApiGeneratorView', $data);
    }

    public function bulkActions(Request $request){

        if ($request->bulkAction == 'ACTIVE'){
            ApiConfiguration::whereIn('id', $request->selectedIds)->update(['status' => 1]);
        }
        else{
            ApiConfiguration::whereIn('id', $request->selectedIds)->update(['status' => 0]);
        }

        $data = [
            'message' => "Update API Success!",
            'type' => "success"
        ];
    
        return back()->with($data);
    }
    
}
