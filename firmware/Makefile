CXX ?= clang++
CXXFLAGS ?= -std=c++14 -Wall -Wextra -Werror -pedantic -O2

BUILD_DIR := .build-host
TEST_BINARY := $(BUILD_DIR)/host_tests
CORE_SOURCES := \
	src/core/calibration.cpp \
	src/core/command_parser.cpp \
	src/core/moisture_filter.cpp \
	src/core/persistent_budget.cpp \
	src/core/policy.cpp \
	src/core/telemetry.cpp \
	src/core/watering_controller.cpp
TEST_SOURCES := tests/host_tests.cpp

.PHONY: test clean

test: $(TEST_BINARY)
	./$(TEST_BINARY)

$(TEST_BINARY): $(CORE_SOURCES) $(TEST_SOURCES)
	mkdir -p $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -Isrc $(CORE_SOURCES) $(TEST_SOURCES) -o $(TEST_BINARY)

clean:
	rm -rf $(BUILD_DIR)
