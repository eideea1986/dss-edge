cmake_minimum_required(VERSION 3.10)
project(trassir_recorder)

set(CMAKE_CXX_STANDARD 17)

find_package(PkgConfig REQUIRED)
pkg_check_modules(AV REQUIRED libavformat libavcodec libavutil libswscale)
pkg_check_modules(SQLITE REQUIRED sqlite3)

include_directories(${AV_INCLUDE_DIRS})
link_directories(${AV_LIBRARY_DIRS})

find_package(Threads REQUIRED)

add_executable(recorder
  main.cpp
  Decoder.cpp
  Segmenter.cpp
  WriterPool.cpp
  IndexDB.cpp
  AiDB.cpp
)

target_link_libraries(recorder
  /usr/lib/x86_64-linux-gnu/libavformat.so
  /usr/lib/x86_64-linux-gnu/libavcodec.so
  /usr/lib/x86_64-linux-gnu/libavutil.so
  /usr/lib/x86_64-linux-gnu/libswscale.so
  sqlite3
  Threads::Threads
)

add_executable(playback_engine
  PlaybackEngine.cpp
)

target_link_libraries(playback_engine
  /usr/lib/x86_64-linux-gnu/libavformat.so
  /usr/lib/x86_64-linux-gnu/libavcodec.so
  /usr/lib/x86_64-linux-gnu/libavutil.so
  /usr/lib/x86_64-linux-gnu/libswscale.so
  sqlite3
  Threads::Threads
)
