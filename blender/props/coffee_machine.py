'''Kitchenette counter with an espresso machine, mugs, and a status LED (coffee_led).'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
parts = kit.counter('c_')
parts += kit.espresso_machine('e_', -0.15, 0.0, 0.845)
parts += kit.mug('m1', 0.2, -0.08, 0.845) + kit.mug('m2', 0.3, 0.05, 0.845)
parts.append(cyl('jar', 0.06, 0.14, (0.33, 0.14, 0.915), 'wood_light', verts=16, bevel=0.012))
join(parts, 'coffee_machine')
export()
