#include <napi.h>
#include <string>

Napi::String GetVendorCode(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string vendor_code = "AzICkhgcaswidhgvawheguahwoguhadslghouawehgljdsahgljaweogiuhwaoljgfhoasdhgoauwhoghawouhgvowa=="; // Вставь свой реальный DEMO Vendor Code
  return Napi::String::New(env, vendor_code);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("get", Napi::Function::New(env, GetVendorCode));
  return exports;
}

NODE_API_MODULE(vendorCodeLoader, Init)