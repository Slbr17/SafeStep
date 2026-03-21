-- SafeStep walking profile for OSRM
-- Encodes road-type preference by adjusting effective speed:
-- primary roads get full walking speed, small roads get very low effective speed
-- so the router treats them as much "further away" in time

api_version = 4

local Set = require('lib/set')
local Sequence = require('lib/sequence')
local find_access_tag = require("lib/access").find_access_tag

local BASE_SPEED = 5.0  -- normal walking speed km/h

-- Effective speed per highway type.
-- Lower speed = router treats road as longer = avoids it.
-- Primary roads get full speed. Residential gets 0.1 km/h (50x penalty).
local HIGHWAY_SPEED = {
  primary         = 5.0,
  secondary       = 4.5,
  tertiary        = 3.0,
  pedestrian      = 3.0,
  footway         = 2.5,
  unclassified    = 0.15,
  residential     = 0.15,
  living_street   = 0.12,
  service         = 0.10,
  path            = 0.15,
  track           = 0.10,
  steps           = 0.08,
}

function setup()
  return {
    properties = {
      max_speed_for_map_matching    = 40/3.6,
      weight_name                   = 'duration',
      process_call_tagless_node     = false,
      u_turn_penalty                = 2,
      continue_straight_at_waypoint = false,
      use_turn_restrictions         = false,
      left_hand_driving             = false,
      traffic_light_penalty         = 2,
    },
    default_mode  = mode.walking,
    default_speed = BASE_SPEED,
    access_tag_whitelist = Set {
      'yes', 'foot', 'permissive', 'designated', 'public'
    },
    access_tag_blacklist = Set {
      'no', 'private', 'agricultural', 'forestry', 'delivery', 'customers'
    },
    access_tags_hierarchy = Sequence { 'foot', 'access' },
    restrictions = Sequence { 'foot' },
  }
end

function process_node(profile, node, result, relations)
  local access = find_access_tag(node, profile.access_tags_hierarchy)
  if access and profile.access_tag_blacklist[access] then
    result.barrier = true
  end
end

function process_way(profile, way, result, relations)
  local highway = way:get_value_by_key('highway')
  if not highway or highway == '' then return end

  local access = find_access_tag(way, profile.access_tags_hierarchy)
  if access and profile.access_tag_blacklist[access] then return end

  if way:get_value_by_key('route') == 'ferry' then return end

  local speed = HIGHWAY_SPEED[highway]
  if not speed then return end

  result.forward_mode   = mode.walking
  result.backward_mode  = mode.walking
  -- Use effective speed to encode penalty — low speed = high cost = avoided
  result.forward_speed  = speed
  result.backward_speed = speed
end

function process_turn(profile, turn)
  turn.duration = 0
  if turn.is_u_turn then
    turn.duration = profile.properties.u_turn_penalty
  end
end

return {
  setup        = setup,
  process_way  = process_way,
  process_node = process_node,
  process_turn = process_turn,
}
