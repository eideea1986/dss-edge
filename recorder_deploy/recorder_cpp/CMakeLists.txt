cmake_minimum_required(VERSION 3.10)
project(dss_recorder)

set(CMAKE_CXX_STANDARD 17)

# We only need standard libraries for the FFmpeg wrapper
add_executable(recorder
  recorder.cpp
)

# If nlohmann/json is needed and not in system, we include it if possible
# But normally it's a header-only lib we can just have in the folder.
# For now, let's assume it's available or we provide it.

target_link_libraries(recorder stdc++fs)
