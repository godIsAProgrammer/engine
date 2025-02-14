cmake_minimum_required(VERSION 2.8)

set(APP_NAME "webgpu" CACHE STRING "Project Name")
project(${APP_NAME}_wasm)

if (NOT CMAKE_BUILD_TYPE OR CMAKE_BUILD_TYPE STREQUAL "")
    set(CMAKE_BUILD_TYPE "Release" CACHE STRING "" FORCE)
endif()

set(ENGINE_ROOT_DIR ${CMAKE_CURRENT_LIST_DIR}/../../..)

include(${ENGINE_ROOT_DIR}/cmake/predefine.cmake)

include (${ENGINE_ROOT_DIR}/external/CMakeLists.txt)

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wno-nonportable-include-path -fno-exceptions -v")
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -g3 -D_DEBUG=1 -Wno-unused -O0")
set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -g0 -DNDEBUG=1 -O3")

AUX_SOURCE_DIRECTORY(
    .
    WGPU_SRC
)

AUX_SOURCE_DIRECTORY(
    ../../../cocos/base/threading
    COCOS_BASE_THREAD
)
list(FILTER COCOS_BASE_THREAD EXCLUDE REGEX "[\\w+]*.mm")

AUX_SOURCE_DIRECTORY(
    ../../../cocos/base
    COCOS_BASE
)

AUX_SOURCE_DIRECTORY(
    ../../../cocos/renderer/gfx-base
    GFX_BASE
)
list(FILTER GFX_BASE EXCLUDE REGEX "[\\w+]*SPIRVUtils.cpp")

AUX_SOURCE_DIRECTORY(
    ../../../cocos/renderer/gfx-base/states
    GFX_BASE_STATES
)

AUX_SOURCE_DIRECTORY(
    ../../../cocos/renderer/gfx-agent
    GFX_AGENT
)

AUX_SOURCE_DIRECTORY(
    ../../../cocos/renderer/gfx-validator
    GFX_VALIDATOR
)

AUX_SOURCE_DIRECTORY(
    ../../../cocos/renderer/gfx-empty
    GFX_EMPTY
)

# AUX_SOURCE_DIRECTORY(
#     ../../../cocos/renderer/pipeline
#     PIPELINE
# )

set(RENDERER
    ../../../cocos/renderer/GFXDeviceManager.h
    ${GFX_BASE}
    ${GFX_AGENT}
    ${GFX_VALIDATOR}
    ${GFX_EMPTY}
    ${GFX_BASE_STATES}
    #${PIPELINE}
)

set(NATIVE_SRC
    ${COCOS_BASE}
    ${COCOS_BASE_THREAD}
    ${RENDERER}
    ${WGPU_SRC}
)

AUX_SOURCE_DIRECTORY(
    ./
    WASM_EXPORTS
)

add_executable(${APP_NAME}_wasm ${WASM_EXPORTS} ${NATIVE_SRC})

target_include_directories(
	${APP_NAME}_wasm PRIVATE "${CMAKE_CURRENT_LIST_DIR}/inc"
	${CC_EXTERNAL_INCLUDES}
    ${CMAKE_CURRENT_LIST_DIR}
	${ENGINE_ROOT_DIR}
	${ENGINE_ROOT_DIR}/cocos
    ${ENGINE_ROOT_DIR}/cocos/base
	${ENGINE_ROOT_DIR}/cocos/renderer
	${ENGINE_ROOT_DIR}/cocos/platform
	${ENGINE_ROOT_DIR}/cocos/renderer/core
	${CC_EXTERNAL_PRIVATE_INCLUDES}
)

target_link_libraries(
    ${APP_NAME}_wasm PRIVATE PUBLIC
    ${CC_EXTERNAL_LIBS}
)

set(EMS_LINK_FLAGS
"--bind --no-entry -O3 -s USE_ES6_IMPORT_META=0 -s EXPORT_ES6=1 -s MODULARIZE=1 -s EXPORT_NAME='wasmDevice' -s ENVIRONMENT=web -s WASM=1 -s USE_WEBGPU=1 -s NO_EXIT_RUNTIME=1 -s LLD_REPORT_UNDEFINED -s ALLOW_MEMORY_GROWTH=1 -s ASSERTIONS=1 -s SAFE_HEAP -s WARN_UNALIGNED=1"
)

set_target_properties(${APP_NAME}_wasm PROPERTIES LINK_FLAGS ${EMS_LINK_FLAGS})