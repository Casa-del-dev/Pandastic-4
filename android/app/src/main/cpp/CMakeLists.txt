# On-device LLM (Qwen3.5-0.8B GGUF) through llama.cpp, used only to read SMS text into slots.
cmake_minimum_required(VERSION 3.22.1)
project(pandastic_llm C CXX)

# Always optimise: ggml at -O0 (the default for debug APKs) is many times too slow to answer an SMS.
set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)

include(FetchContent)
# Only the core library: no tools, servers, tests or network code.
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
if(ANDROID_ABI STREQUAL "arm64-v8a")
    # Cortex-A55 and newer (most 4 GB phones since 2019) have dot-product and fp16 instructions.
    set(GGML_CPU_ARM_ARCH "armv8.2-a+dotprod+fp16" CACHE STRING "" FORCE)
endif()
if(ANDROID_ABI STREQUAL "x86_64")
    # Emulator only. The default Android emulator CPU exposes SSE4.2, AVX and F16C but not AVX2/FMA.
    set(GGML_SSE42 ON CACHE BOOL "" FORCE)
    set(GGML_AVX ON CACHE BOOL "" FORCE)
    set(GGML_F16C ON CACHE BOOL "" FORCE)
    set(GGML_AVX2 OFF CACHE BOOL "" FORCE)
    set(GGML_FMA OFF CACHE BOOL "" FORCE)
endif()

FetchContent_Declare(llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
    GIT_TAG v0.5.0
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(llama)

add_library(pandastic_llm SHARED llm_jni.cpp)
target_compile_features(pandastic_llm PRIVATE cxx_std_17)
target_link_libraries(pandastic_llm PRIVATE llama ggml android log)
