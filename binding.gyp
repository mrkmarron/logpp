{
    "targets": [{
        "target_name": "nlogger",
        "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
        "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
        "cflags!": [ "-fno-exceptions" ],
        "cflags_cc!": [ "-fno-exceptions" ],
        "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.7",
        },
        "msvs_settings": {
            "VCCLCompilerTool": { "ExceptionHandling": 1 },
        },
        "sources": [ 
            "./nsrc/common.h",
            "./nsrc/environment.h",
            "./nsrc/format.h",
            "./nsrc/formatter.h",
            "./nsrc/processingblock.h",
            "./nsrc/formatworker.h",
            "./nsrc/nlogger.cc" 
            ]
    }]
}