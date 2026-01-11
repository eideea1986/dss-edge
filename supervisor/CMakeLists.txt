cmake_minimum_required(VERSION 3.10)
project(dss-supervisor)

set(CMAKE_CXX_STANDARD 17)

add_executable(dss-supervisor
  supervisor.cpp
)

target_link_libraries(dss-supervisor pthread)

# Install target
install(TARGETS dss-supervisor DESTINATION /usr/bin)
