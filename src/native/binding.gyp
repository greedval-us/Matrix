{
  "targets": [
    {
      "target_name": "vendorCodeLoader",
      "sources": [ "vendorCodeLoader.cc" ],
      "include_dirs": [
        "../../node_modules/node-addon-api"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}