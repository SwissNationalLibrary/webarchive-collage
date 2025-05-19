require './delegates'

obj = CustomDelegate.new
obj.context = {
  'identifier' => 'rrandom!test',
  'client_ip' => '127.0.0.1',
  'request_headers' => []
}

puts obj.read_scale_ratios
puts obj.get_image_scale_ratio()
