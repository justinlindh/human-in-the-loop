'''Server rack with six units; rack_led_00..11 are separate so the game can blink them.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.rack('r_'), 'server_rack')
export()
